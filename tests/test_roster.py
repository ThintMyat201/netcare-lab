"""Roster generation and the rules for changing a week, run against a real MongoDB.

The slot key's unique index and the overlap queries are what these tests check, so a fake
database would only test the fake. Each test gets a fresh database and drops it afterwards.
The tests are skipped when MongoDB is not running.
"""
import asyncio
import os
from datetime import datetime

import pytest
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ServerSelectionTimeoutError

import core
import operations
import roster
from core import CAMPUS_TZ

TEST_DB = core.db.name
ADMIN = {"id": "admin", "name": "Alex Morgan", "role": "admin"}
LABS = [{"id": "lab-1", "name": "Computing Lab A", "code": "CL-A"}, {"id": "lab-2", "name": "Computing Lab B", "code": "CL-B"}]
ASSISTANTS = [
    {"id": "asst-a", "name": "Ana Reyes", "email": "ana@example.com", "role": "assistant", "active": True},
    {"id": "asst-b", "name": "Ben Cruz", "email": "ben@example.com", "role": "assistant", "active": True},
    {"id": "asst-c", "name": "Cai Lim", "email": "cai@example.com", "role": "assistant", "active": True},
    # First by name and never rostered: generating would pick him first if it looked at inactive accounts.
    {"id": "abel", "name": "Abel Tan", "email": "abel@example.com", "role": "assistant", "active": False},
]
WEEK = "2030-01-07"  # A Monday.


def at(day, clock):
    return datetime.fromisoformat(f"{day}T{clock}").replace(tzinfo=CAMPUS_TZ)


def template(id, day, start, end, seats=1):
    return {"id": id, "name": id, "day_of_week": day, "start_time": start, "end_time": end,
            "lab_id": "lab-1", "lab_name": "Computing Lab A", "required_assistants": seats, "active": True}


def shift(assistant_id, day, start, end):
    """A shift assigned by hand: no template, so no slot key."""
    name = next(a["name"] for a in ASSISTANTS if a["id"] == assistant_id)
    return {"id": f"{assistant_id}-{day}-{start}", "assistant_id": assistant_id, "assistant_name": name,
            "lab_id": "lab-1", "lab_name": "Computing Lab A", "start": at(day, start).isoformat(),
            "end": at(day, end).isoformat(), "acknowledged_at": None, "cancelled": False}


def week():
    return roster.WeekInput(week=WEEK)


def run(monkeypatch, scenario):
    """Run `scenario(db, clock)` on a fresh database holding the labs and assistants above.
    `clock("2030-01-06 12:00")` sets the time the roster code sees."""
    assert TEST_DB.startswith("netcare_test"), TEST_DB  # Never drop a database the tests did not make.

    def clock(moment):
        fixed = datetime.fromisoformat(moment).replace(tzinfo=CAMPUS_TZ)
        for module in (roster, operations):
            monkeypatch.setattr(module, "now", lambda: fixed)

    async def main():
        # Motor ties a client to the first event loop that uses it, so every test opens its own.
        client = AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=2000, tz_aware=True, tzinfo=CAMPUS_TZ)
        try:
            await client.admin.command("ping")
        except ServerSelectionTimeoutError:
            client.close()
            pytest.skip("MongoDB is not running.")
        db = client[TEST_DB]
        for module in (core, operations, roster):
            monkeypatch.setattr(module, "db", db)
        await client.drop_database(TEST_DB)
        try:
            await core.indexes()
            await db.labs.insert_many([dict(lab) for lab in LABS])
            await db.users.insert_many([dict(person) for person in ASSISTANTS])
            await scenario(db, clock)
        finally:
            await client.drop_database(TEST_DB)
            client.close()

    asyncio.run(main())


async def refused(request):
    with pytest.raises(HTTPException) as error:
        await request
    return error.value.status_code, error.value.detail


def test_each_seat_goes_to_the_free_assistant_with_the_fewest_shifts_and_a_rerun_adds_nothing(monkeypatch):
    async def scenario(db, clock):
        clock("2030-01-06 12:00")  # The Sunday before, so the whole week is ahead.
        await db.shifts.insert_many([
            shift("asst-a", "2030-01-08", "08:00", "10:00"),
            shift("asst-a", "2030-01-08", "10:00", "12:00"),
            shift("asst-b", "2030-01-07", "08:00", "12:00"),
        ])
        await db.shift_templates.insert_many([template("mon", 0, "09:00", "11:00", seats=2), template("tue", 1, "13:00", "17:00")])

        assert (await roster.generate(week(), user=ADMIN))["created"] == 3
        seats = {s["slot_key"]: s["assistant_name"] async for s in db.shifts.find({"slot_key": {"$exists": True}})}
        assert seats == {
            "mon:2030-01-07:0": "Cai Lim",    # No shifts yet.
            "mon:2030-01-07:1": "Ana Reyes",  # Ben and Cai are busy then, so it skips to Ana despite her two.
            "tue:2030-01-08:0": "Ben Cruz",   # Ben and Cai have one each; Ben comes first by name.
        }

        again = await roster.generate(roster.WeekInput(week="2030-01-09"), user=ADMIN)  # Any day names its week.
        assert again == {"created": 0, "message": "Nothing new to add: every seat this week is filled or has already started."}

    run(monkeypatch, scenario)


def test_a_seat_stays_empty_rather_than_double_booking_and_is_filled_once_somebody_is_free(monkeypatch):
    async def scenario(db, clock):
        clock("2030-01-06 12:00")
        await db.shift_templates.insert_one(template("mon", 0, "08:00", "12:00", seats=4))
        assert (await roster.generate(week(), user=ADMIN))["created"] == 3

        await db.users.insert_one({"id": "asst-d", "name": "Dee Santos", "email": "dee@example.com", "role": "assistant", "active": True})
        assert (await roster.generate(week(), user=ADMIN))["created"] == 1
        people = [s["assistant_id"] async for s in db.shifts.find({})]
        assert sorted(people) == ["asst-a", "asst-b", "asst-c", "asst-d"]

    run(monkeypatch, scenario)


def test_the_week_view_says_what_each_shift_still_allows_and_assistants_see_only_their_own(monkeypatch):
    async def scenario(db, clock):
        clock("2030-01-06 12:00")
        await db.shift_templates.insert_many([template("mon", 0, "08:00", "12:00"), template("wed", 2, "08:00", "12:00")])
        await roster.generate(week(), user=ADMIN)

        clock("2030-01-07 09:00")  # Monday's shift is under way.
        view = await roster.roster(WEEK, user=ADMIN)
        assert [(s["slot_key"], s["removable"], s["reassignable"]) for s in view["shifts"]] == [
            ("mon:2030-01-07:0", False, True),  # Started: it is the attendance record, but somebody can cover the rest.
            ("wed:2030-01-09:0", True, True),
        ]
        assert (view["shift_count"], view["removable_count"], view["active_templates"]) == (2, 1, 2)

        ana = await roster.roster(WEEK, user={"id": "asst-a", "name": "Ana Reyes", "role": "assistant"})
        assert [s["assistant_id"] for s in ana["shifts"]] == ["asst-a"]
        assert "assistants" not in ana

    run(monkeypatch, scenario)


def test_started_shifts_stay_and_removed_seats_are_filled_again(monkeypatch):
    async def scenario(db, clock):
        clock("2030-01-06 12:00")
        await db.shift_templates.insert_many([template("mon", 0, "08:00", "12:00"), template("wed", 2, "08:00", "12:00")])
        await roster.generate(week(), user=ADMIN)

        clock("2030-01-07 09:00")
        # A seat added once its time has come is skipped: nobody could have worked a shift made after it began.
        await db.shift_templates.insert_one(template("mon-late", 0, "08:30", "10:00"))
        monday = await db.shifts.find_one({"slot_key": "mon:2030-01-07:0"}, {"_id": 0})
        assert (await refused(operations.remove_shift(monday, ADMIN)))[0] == 409

        assert await roster.clear_week(week(), user=ADMIN) == {"removed": 1, "kept": 1}
        assert (await roster.generate(week(), user=ADMIN))["created"] == 1
        assert sorted([s["slot_key"] async for s in db.shifts.find({"cancelled": False})]) == ["mon:2030-01-07:0", "wed:2030-01-09:0"]
        # The removed shift stays as history, without the slot key the new one now holds.
        assert await db.shifts.count_documents({"cancelled": True, "slot_key": {"$exists": False}}) == 1

    run(monkeypatch, scenario)


def test_a_shift_is_handed_over_until_it_ends_but_never_to_somebody_busy_then(monkeypatch):
    async def scenario(db, clock):
        clock("2030-01-06 12:00")
        await db.shift_templates.insert_many([template("am", 0, "08:00", "12:00", seats=2), template("pm", 0, "13:00", "17:00")])
        await roster.generate(week(), user=ADMIN)  # Ana and Ben take the morning, Cai the afternoon.
        anas = await db.shifts.find_one({"assistant_id": "asst-a"}, {"_id": 0})
        await db.shifts.update_one({"id": anas["id"]}, {"$set": {"acknowledged_at": "2030-01-06T12:00:00+08:00"}})

        def hand(shift_id, to):
            return roster.reassign(shift_id, roster.ReassignInput(assistant_id=to), user=ADMIN)

        assert await refused(hand(anas["id"], "asst-b")) == (409, "Ben Cruz is already rostered at that time.")
        assert await refused(hand(anas["id"], "asst-a")) == (409, "That shift is already assigned to them.")
        assert await refused(hand(anas["id"], "abel")) == (422, "Shifts can only be assigned to an active assistant.")

        handed = await hand(anas["id"], "asst-c")
        assert (handed["assistant_name"], handed["acknowledged_at"]) == ("Cai Lim", None)  # The acknowledgement was Ana's.

        clock("2030-01-07 17:30")  # Every Monday shift has ended.
        assert await refused(hand(anas["id"], "asst-b")) == (409, "This shift has already ended, so it cannot be reassigned.")

    run(monkeypatch, scenario)


def test_two_generate_requests_at_once_still_fill_each_seat_once(monkeypatch):
    async def scenario(db, clock):
        clock("2030-01-06 12:00")
        await db.shift_templates.insert_many([template("mon", 0, "08:00", "12:00", seats=2), template("tue", 1, "08:00", "12:00")])

        results = await asyncio.gather(roster.generate(week(), user=ADMIN), roster.generate(week(), user=ADMIN))
        assert sum(r["created"] for r in results) == 3
        shifts = await db.shifts.find({}, {"_id": 0}).to_list(None)
        assert sorted(s["slot_key"] for s in shifts) == ["mon:2030-01-07:0", "mon:2030-01-07:1", "tue:2030-01-08:0"]
        assert len({s["assistant_id"] for s in shifts if s["slot_key"].startswith("mon")}) == 2  # Nobody holds both Monday seats.

    run(monkeypatch, scenario)
