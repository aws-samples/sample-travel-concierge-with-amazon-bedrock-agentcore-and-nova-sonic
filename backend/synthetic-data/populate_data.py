#!/usr/bin/env python3
"""
Synthetic Data Seeder for Airline Concierge

Seeds DynamoDB tables with realistic sample data based on real booking patterns.
"""
import boto3
import argparse
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

dynamodb = boto3.resource("dynamodb")

# Table references
CUSTOMERS = dynamodb.Table("TH-Customers")
BOOKINGS = dynamodb.Table("TH-Bookings")
SEATMAP = dynamodb.Table("TH-SeatMap")
PASSENGERS = dynamodb.Table("TH-Passengers")
PURCHASES = dynamodb.Table("TH-PurchaseHistory")
PREFERENCES = dynamodb.Table("TH-Preferences")
FLIGHT_STATUS = dynamodb.Table("TH-FlightStatus")

CUSTOMER_ID = "CUST-001"


def seed_customer(email=None, name=None):
    """Seed customer profile."""
    print("  Seeding customer profile...")
    customer_email = email or "traveler@example.com"
    customer_name = name or "Alex Johnson"
    CUSTOMERS.put_item(Item={
        "PK": f"CUSTOMER#{CUSTOMER_ID}",
        "SK": "PROFILE",
        "name": customer_name,
        "email": customer_email,
        "phone": "+1-555-0123",
        "loyaltyTier": "GOLD",
        "loyaltyPoints": 18711,
        "passportNumber": "****4567",
        "passportExpiry": "2028-03-15",
        "nationality": "US",
        "frequentFlyerNumber": "SW0XXXX",
        "creditCardTier": "PREMIUM",
        "createdAt": "2023-01-15T00:00:00Z",
        "updatedAt": datetime.utcnow().isoformat() + "Z",
    })
    print(f"    Customer email: {customer_email}")


def seed_flight_bookings():
    """Seed flight bookings from real email data."""
    print("  Seeding flight bookings...")
    flights = [
        {
            "bookingId": "BK-001", "confirmationNumber": "OOUNFG", "status": "COMPLETED",
            "flightNumber": "SW2350", "airline": "SkyWave Airlines",
            "departureAirport": "DFW", "departureCity": "Dallas/Fort Worth",
            "arrivalAirport": "MEX", "arrivalCity": "Mexico City",
            "departureTime": "2025-05-28T14:30:00-05:00", "arrivalTime": "2025-05-28T16:15:00-05:00",
            "fareClass": "ECONOMY", "partyId": None, "partySize": 1, "milesEarned": 934,
        },
        {
            "bookingId": "BK-002", "confirmationNumber": "KNYLVQ", "status": "COMPLETED",
            "flightNumber": "SW2351", "airline": "SkyWave Airlines",
            "departureAirport": "MEX", "departureCity": "Mexico City",
            "arrivalAirport": "DFW", "arrivalCity": "Dallas/Fort Worth",
            "departureTime": "2025-06-05T17:15:00-05:00", "arrivalTime": "2025-06-05T21:10:00-05:00",
            "fareClass": "ECONOMY", "partyId": None, "partySize": 1, "milesEarned": 934,
        },
        {
            "bookingId": "BK-003", "confirmationNumber": "KNYLVQ", "status": "COMPLETED",
            "flightNumber": "SW1523", "airline": "SkyWave Airlines",
            "departureAirport": "DFW", "departureCity": "Dallas/Fort Worth",
            "arrivalAirport": "DEN", "arrivalCity": "Denver",
            "departureTime": "2025-06-06T07:05:00-05:00", "arrivalTime": "2025-06-06T08:11:00-05:00",
            "fareClass": "ECONOMY", "partyId": None, "partySize": 1, "milesEarned": 641,
        },
        {
            "bookingId": "BK-004", "confirmationNumber": "MHYPMM", "status": "COMPLETED",
            "flightNumber": "SW2351", "airline": "SkyWave Airlines",
            "departureAirport": "MEX", "departureCity": "Mexico City",
            "arrivalAirport": "DFW", "arrivalCity": "Dallas/Fort Worth",
            "departureTime": "2025-07-08T17:15:00-05:00", "arrivalTime": "2025-07-08T21:05:00-05:00",
            "fareClass": "ECONOMY", "partyId": "PARTY-001", "partySize": 3, "milesEarned": 934,
        },
        {
            "bookingId": "BK-005", "confirmationNumber": "WGBFXB", "status": "COMPLETED",
            "flightNumber": "SW3080", "airline": "SkyWave Airlines",
            "departureAirport": "DFW", "departureCity": "Dallas/Fort Worth",
            "arrivalAirport": "LAS", "arrivalCity": "Las Vegas",
            "departureTime": "2025-11-30T17:40:00-06:00", "arrivalTime": "2025-11-30T18:38:00-06:00",
            "fareClass": "ECONOMY", "partyId": None, "partySize": 1, "milesEarned": 1055,
        },
        {
            "bookingId": "BK-006", "confirmationNumber": "WGBFXB", "status": "COMPLETED",
            "flightNumber": "SW1863", "airline": "SkyWave Airlines",
            "departureAirport": "LAS", "departureCity": "Las Vegas",
            "arrivalAirport": "DFW", "arrivalCity": "Dallas/Fort Worth",
            "departureTime": "2025-12-05T10:00:00-06:00", "arrivalTime": "2025-12-05T14:50:00-06:00",
            "fareClass": "ECONOMY", "partyId": None, "partySize": 1, "milesEarned": 1055,
        },
        {
            "bookingId": "BK-007", "confirmationNumber": "NVTMEX", "status": "COMPLETED",
            "flightNumber": "SW1177", "airline": "SkyWave Airlines",
            "departureAirport": "DFW", "departureCity": "Dallas/Fort Worth",
            "arrivalAirport": "DCA", "arrivalCity": "Washington Reagan",
            "departureTime": "2026-02-23T09:23:00-06:00", "arrivalTime": "2026-02-23T13:19:00-06:00",
            "fareClass": "ECONOMY", "partyId": None, "partySize": 1, "milesEarned": 1192,
        },
        {
            "bookingId": "BK-008", "confirmationNumber": "NVTMEX", "status": "COMPLETED",
            "flightNumber": "SW1177", "airline": "SkyWave Airlines",
            "departureAirport": "DCA", "departureCity": "Washington Reagan",
            "arrivalAirport": "DFW", "arrivalCity": "Dallas/Fort Worth",
            "departureTime": "2026-02-27T14:14:00-06:00", "arrivalTime": "2026-02-27T16:55:00-06:00",
            "fareClass": "ECONOMY", "partyId": None, "partySize": 1, "milesEarned": 1192,
        },
        # Upcoming flights (October 2026 — outbound + return)
        {
            "bookingId": "BK-009", "confirmationNumber": "FUTR01", "status": "CONFIRMED",
            "flightNumber": "SW2350", "airline": "SkyWave Airlines",
            "departureAirport": "DFW", "departureCity": "Dallas/Fort Worth",
            "arrivalAirport": "MEX", "arrivalCity": "Mexico City",
            "departureTime": "2026-10-10T14:30:00-05:00", "arrivalTime": "2026-10-10T16:15:00-05:00",
            "fareClass": "ECONOMY", "partyId": "PARTY-002", "partySize": 3, "milesEarned": 934,
        },
        {
            "bookingId": "BK-010", "confirmationNumber": "FUTR01", "status": "CONFIRMED",
            "flightNumber": "SW2351", "airline": "SkyWave Airlines",
            "departureAirport": "MEX", "departureCity": "Mexico City",
            "arrivalAirport": "DFW", "arrivalCity": "Dallas/Fort Worth",
            "departureTime": "2026-10-17T17:15:00-05:00", "arrivalTime": "2026-10-17T21:05:00-05:00",
            "fareClass": "ECONOMY", "partyId": "PARTY-002", "partySize": 3, "milesEarned": 934,
        },
    ]

    for f in flights:
        item = {
            "PK": f"CUSTOMER#{CUSTOMER_ID}",
            "SK": f"BOOKING#{f['bookingId']}",
            "GSI1PK": f"FLIGHT#{f['flightNumber']}#{f['departureTime'][:10]}",
            "GSI1SK": f"CUSTOMER#{CUSTOMER_ID}",
            "bookingType": "FLIGHT",
            **{k: v for k, v in f.items() if v is not None},
            "createdAt": datetime.utcnow().isoformat() + "Z",
        }
        BOOKINGS.put_item(Item=item)
    print(f"    {len(flights)} flight bookings seeded")


def seed_seat_map():
    """Seed seat map for upcoming flights with realistic aircraft layout."""
    print("  Seeding seat maps for upcoming flights...")

    # Booked flights for the customer with their occupied seats
    customer_flights = [
        ("SW2350", "2026-10-10", {"14A", "22D", "30F"}),   # BK-009: Ravi 14A, Priya 22D, Arjun 30F
        ("SW2351", "2026-10-17", {"18C", "18D", "18E"}),   # BK-010: Ravi 18C, Priya 18D, Arjun 18E
    ]

    for flight, date, occupied_seats in customer_flights:
        seats = []
        for row in range(10, 36):
            for col in "ABCDEF":
                seat_num = f"{row}{col}"
                seat_type = "WINDOW" if col in "AF" else ("AISLE" if col in "CD" else "MIDDLE")
                is_available = seat_num not in occupied_seats
                seats.append({
                    "PK": f"FLIGHT#{flight}#{date}",
                    "SK": f"SEAT#{seat_num}",
                    "seatNumber": seat_num, "row": row, "column": col,
                    "seatType": seat_type, "cabin": "ECONOMY",
                    "isAvailable": is_available,
                    "isExtraLegroom": row in [10, 11, 21],
                    "isExitRow": row in [21],
                    "price": 45 if row in [10, 11, 21] else 0,
                    "assignedTo": f"CUSTOMER#{CUSTOMER_ID}" if not is_available else None,
                })
        _write_seats(seats, flight, date)

    # ── Alternative flights for rebooking with varied seat patterns ──

    # Option A: SW2351 Oct 18 — mostly empty, 3 adjacent seats in row 16
    _seed_alternative_flight("SW2351", "2026-10-18",
        booked_seats={"10A", "10B", "12C", "12D", "15A", "20E", "20F", "25A", "25B", "25C", "30D"})

    # Option B: SW1863 Oct 17 — nearly full, only scattered middle seats left
    all_seats = {f"{r}{c}" for r in range(10, 36) for c in "ABCDEF"}
    available_middles = {"14B", "18E", "22B", "26E", "29B", "33E"}  # Only middle seats
    available_aisles = {"28C"}  # One aisle seat
    booked_b = all_seats - available_middles - available_aisles
    _seed_alternative_flight("SW1863", "2026-10-17", booked_seats=booked_b)

    # Option C: SW982 Oct 18 — half full, seats available but no 3 adjacent group
    booked_c = set()
    for row in range(10, 36):
        if row % 2 == 0:  # Even rows mostly booked
            for col in "ABCDEF":
                if not (col == "F" and row > 20):  # Some window seats open in back
                    booked_c.add(f"{row}{col}")
        else:  # Odd rows: book A, C, D to break adjacency
            booked_c.update({f"{row}A", f"{row}C", f"{row}D"})
    _seed_alternative_flight("SW982", "2026-10-18", booked_seats=booked_c)


def _seed_alternative_flight(flight, date, booked_seats):
    """Seed a seat map for an alternative flight with specific booked seats."""
    seats = []
    for row in range(10, 36):
        for col in "ABCDEF":
            seat_num = f"{row}{col}"
            seat_type = "WINDOW" if col in "AF" else ("AISLE" if col in "CD" else "MIDDLE")
            is_available = seat_num not in booked_seats
            seats.append({
                "PK": f"FLIGHT#{flight}#{date}",
                "SK": f"SEAT#{seat_num}",
                "seatNumber": seat_num, "row": row, "column": col,
                "seatType": seat_type, "cabin": "ECONOMY",
                "isAvailable": is_available,
                "isExtraLegroom": row in [10, 11, 21],
                "isExitRow": row in [21],
                "price": 45 if row in [10, 11, 21] else 0,
                "assignedTo": None if is_available else "OTHER_PASSENGER",
            })
    _write_seats(seats, flight, date)


def _write_seats(seats, flight, date):
    """Write seats to DynamoDB in batch."""
    with SEATMAP.batch_writer() as batch:
        for seat in seats:
            batch.put_item(Item={k: v for k, v in seat.items() if v is not None})
    available = sum(1 for s in seats if s["isAvailable"])
    print(f"    {len(seats)} seats seeded for {flight} on {date} ({available} available)")


def seed_passengers(customer_name=None):
    """Seed passenger details for bookings."""
    print("  Seeding passenger details...")
    lead_name = customer_name or "Alex Johnson"
    passengers = [
        # Outbound flight BK-009 (DFW → MEX) — 3 passengers
        {"bookingId": "BK-009", "passengerId": "PAX-001", "name": lead_name,
         "seatNumber": "14A", "mealPreference": "VEGETARIAN",
         "baggageAllowance": {"cabin": 1, "checked": 0, "extraChecked": 0},
         "specialAssistance": [], "isLeadPassenger": True, "partyId": "PARTY-002",
         "flightNumber": "SW2350", "flightDate": "2026-10-10"},
        {"bookingId": "BK-009", "passengerId": "PAX-002", "name": "Priya Sharma",
         "seatNumber": "22D", "mealPreference": "VEGETARIAN",
         "baggageAllowance": {"cabin": 1, "checked": 0, "extraChecked": 0},
         "specialAssistance": [], "isLeadPassenger": False, "partyId": "PARTY-002",
         "flightNumber": "SW2350", "flightDate": "2026-10-10"},
        {"bookingId": "BK-009", "passengerId": "PAX-003", "name": "Arjun Patel",
         "seatNumber": "30F", "mealPreference": "REGULAR",
         "baggageAllowance": {"cabin": 1, "checked": 0, "extraChecked": 0},
         "specialAssistance": [], "isLeadPassenger": False, "partyId": "PARTY-002",
         "flightNumber": "SW2350", "flightDate": "2026-10-10"},
        # Return flight BK-010 (MEX → DFW) — same 3 passengers, different seats
        {"bookingId": "BK-010", "passengerId": "PAX-004", "name": lead_name,
         "seatNumber": "18C", "mealPreference": "VEGETARIAN",
         "baggageAllowance": {"cabin": 1, "checked": 0, "extraChecked": 0},
         "specialAssistance": [], "isLeadPassenger": True, "partyId": "PARTY-002",
         "flightNumber": "SW2351", "flightDate": "2026-10-17"},
        {"bookingId": "BK-010", "passengerId": "PAX-005", "name": "Priya Sharma",
         "seatNumber": "18D", "mealPreference": "VEGETARIAN",
         "baggageAllowance": {"cabin": 1, "checked": 0, "extraChecked": 0},
         "specialAssistance": [], "isLeadPassenger": False, "partyId": "PARTY-002",
         "flightNumber": "SW2351", "flightDate": "2026-10-17"},
        {"bookingId": "BK-010", "passengerId": "PAX-006", "name": "Arjun Patel",
         "seatNumber": "18E", "mealPreference": "REGULAR",
         "baggageAllowance": {"cabin": 1, "checked": 0, "extraChecked": 0},
         "specialAssistance": [], "isLeadPassenger": False, "partyId": "PARTY-002",
         "flightNumber": "SW2351", "flightDate": "2026-10-17"},
    ]

    for p in passengers:
        PASSENGERS.put_item(Item={
            "PK": f"BOOKING#{p['bookingId']}",
            "SK": f"PASSENGER#{p['passengerId']}",
            "GSI1PK": f"CUSTOMER#{CUSTOMER_ID}",
            "GSI1SK": f"BOOKING#{p['bookingId']}",
            **p,
        })
    print(f"    {len(passengers)} passengers seeded")


def seed_purchase_history():
    """Seed ancillary purchase history for upsell intelligence."""
    print("  Seeding purchase history...")
    purchases = [
        {"category": "WIFI", "description": "Full-flight WiFi package", "amount": Decimal("19.99"), "flightNumber": "SW2350", "bookingId": "BK-001"},
        {"category": "WIFI", "description": "Full-flight WiFi package", "amount": Decimal("19.99"), "flightNumber": "SW2351", "bookingId": "BK-002"},
        {"category": "WIFI", "description": "Full-flight WiFi package", "amount": Decimal("19.99"), "flightNumber": "SW3080", "bookingId": "BK-005"},
        {"category": "BAGGAGE", "description": "Extra checked bag", "amount": Decimal("35.00"), "flightNumber": "SW2351", "bookingId": "BK-004"},
        {"category": "UPGRADE", "description": "Economy to Premium Economy", "amount": Decimal("150.00"), "flightNumber": "SW1177", "bookingId": "BK-007"},
    ]

    for i, p in enumerate(purchases):
        ts = (datetime(2025, 5, 1) + timedelta(days=i * 30)).isoformat() + "Z"
        pid = f"PUR-{i+1:03d}"
        PURCHASES.put_item(Item={
            "PK": f"CUSTOMER#{CUSTOMER_ID}",
            "SK": f"PURCHASE#{ts}#{pid}",
            "GSI1PK": f"CUSTOMER#{CUSTOMER_ID}#CATEGORY#{p['category']}",
            "GSI1SK": f"PURCHASE#{ts}",
            "purchaseId": pid,
            "purchaseDate": ts,
            "currency": "USD",
            **p,
        })
    print(f"    {len(purchases)} purchases seeded")


def seed_preferences():
    """Seed learned preferences derived from booking patterns."""
    print("  Seeding learned preferences...")
    prefs = {
        "SEAT": {"position": "AISLE", "extraLegroom": False, "preferredRows": "14-26"},
        "MEAL": {"dietary": "VEGETARIAN", "allergies": []},
        "TRANSPORT": {"airportTransfer": "RIDESHARE", "preferredService": "Uber"},
        "WIFI": {"usuallyPurchases": True, "preferredPlan": "FULL_FLIGHT"},
    }

    for category, preferences in prefs.items():
        PREFERENCES.put_item(Item={
            "PK": f"CUSTOMER#{CUSTOMER_ID}",
            "SK": f"PREF#{category}",
            "category": category,
            "preferences": preferences,
            "confidence": "HIGH" if category in ["SEAT", "WIFI", "MEAL"] else "MEDIUM",
            "lastUpdated": datetime.utcnow().isoformat() + "Z",
        })
    print(f"    {len(prefs)} preference categories seeded")


def seed_flight_status():
    """Seed flight status data for all flights.
    
    Includes route, fare, and aircraft info so GetRebookOptions can query
    alternative flights on the same route. Makes one upcoming flight delayed
    with a gate change to create a demo scenario for proactive rebooking.
    """
    print("  Seeding flight status data...")

    statuses = [
        # Completed flights — all arrived
        {"flightNumber": "SW2350", "date": "2025-05-28", "status": "ARRIVED",
         "route": "DFW-MEX", "departureAirport": "DFW", "arrivalAirport": "MEX",
         "departureGate": "C22", "arrivalGate": "B14", "terminal": "C",
         "scheduledDeparture": "2025-05-28T14:30:00-05:00", "actualDeparture": "2025-05-28T14:35:00-05:00",
         "scheduledArrival": "2025-05-28T16:15:00-05:00", "actualArrival": "2025-05-28T16:10:00-05:00",
         "delayMinutes": 0, "alerts": [],
         "aircraft": "Boeing 737-800", "baseFare": Decimal("289"), "fareClass": "ECONOMY"},

        {"flightNumber": "SW2351", "date": "2025-06-05", "status": "ARRIVED",
         "route": "MEX-DFW", "departureAirport": "MEX", "arrivalAirport": "DFW",
         "departureGate": "A8", "arrivalGate": "D31", "terminal": "A",
         "scheduledDeparture": "2025-06-05T17:15:00-05:00", "actualDeparture": "2025-06-05T17:20:00-05:00",
         "scheduledArrival": "2025-06-05T21:10:00-05:00", "actualArrival": "2025-06-05T21:15:00-05:00",
         "delayMinutes": 5, "alerts": [],
         "aircraft": "Boeing 737-800", "baseFare": Decimal("289"), "fareClass": "ECONOMY"},

        {"flightNumber": "SW1523", "date": "2025-06-06", "status": "ARRIVED",
         "route": "DFW-DEN", "departureAirport": "DFW", "arrivalAirport": "DEN",
         "departureGate": "B7", "arrivalGate": "A12", "terminal": "B",
         "scheduledDeparture": "2025-06-06T07:05:00-05:00", "actualDeparture": "2025-06-06T07:05:00-05:00",
         "scheduledArrival": "2025-06-06T08:11:00-05:00", "actualArrival": "2025-06-06T08:08:00-05:00",
         "delayMinutes": 0, "alerts": [],
         "aircraft": "Embraer E175", "baseFare": Decimal("199"), "fareClass": "ECONOMY"},

        # Upcoming outbound — ON TIME
        {"flightNumber": "SW2350", "date": "2026-10-10", "status": "ON_TIME",
         "route": "DFW-MEX", "departureAirport": "DFW", "arrivalAirport": "MEX",
         "departureGate": "C22", "arrivalGate": "TBD", "terminal": "C",
         "scheduledDeparture": "2026-10-10T14:30:00-05:00", "estimatedDeparture": "2026-10-10T14:30:00-05:00",
         "scheduledArrival": "2026-10-10T16:15:00-05:00", "estimatedArrival": "2026-10-10T16:15:00-05:00",
         "delayMinutes": 0, "alerts": [],
         "aircraft": "Boeing 737-800", "baggageCarousel": "TBD",
         "baseFare": Decimal("289"), "fareClass": "ECONOMY"},

        # Upcoming return — DELAYED with gate change (demo scenario)
        {"flightNumber": "SW2351", "date": "2026-10-17", "status": "DELAYED",
         "route": "MEX-DFW", "departureAirport": "MEX", "arrivalAirport": "DFW",
         "departureGate": "B42", "previousGate": "A15", "arrivalGate": "TBD", "terminal": "B",
         "scheduledDeparture": "2026-10-17T17:15:00-05:00", "estimatedDeparture": "2026-10-17T18:45:00-05:00",
         "scheduledArrival": "2026-10-17T21:05:00-05:00", "estimatedArrival": "2026-10-17T22:35:00-05:00",
         "delayMinutes": 90,
         "delayReason": "Late arriving aircraft from previous route",
         "alerts": [
             "⚠️ Flight delayed 90 minutes — new departure 6:45 PM",
             "🔄 Gate changed from A15 to B42 (Terminal B)",
             "🍽️ Meal voucher available at Terminal B food court — see gate agent",
         ],
         "aircraft": "Boeing 737-800", "baggageCarousel": "TBD",
         "baseFare": Decimal("289"), "fareClass": "ECONOMY"},

        # ── Alternative flights for rebooking (same MEX-DFW route) ──

        # Option A: Next day same flight — same fare, 3 adjacent seats available
        {"flightNumber": "SW2351", "date": "2026-10-18", "status": "ON_TIME",
         "route": "MEX-DFW", "departureAirport": "MEX", "arrivalAirport": "DFW",
         "departureGate": "A15", "arrivalGate": "TBD", "terminal": "A",
         "scheduledDeparture": "2026-10-18T17:15:00-05:00", "estimatedDeparture": "2026-10-18T17:15:00-05:00",
         "scheduledArrival": "2026-10-18T21:05:00-05:00", "estimatedArrival": "2026-10-18T21:05:00-05:00",
         "delayMinutes": 0, "alerts": [],
         "aircraft": "Boeing 737-800", "baggageCarousel": "TBD",
         "baseFare": Decimal("289"), "fareClass": "ECONOMY"},

        # Option B: Same day evening — higher fare, limited seats
        {"flightNumber": "SW1863", "date": "2026-10-17", "status": "ON_TIME",
         "route": "MEX-DFW", "departureAirport": "MEX", "arrivalAirport": "DFW",
         "departureGate": "C10", "arrivalGate": "TBD", "terminal": "C",
         "scheduledDeparture": "2026-10-17T21:30:00-05:00", "estimatedDeparture": "2026-10-17T21:30:00-05:00",
         "scheduledArrival": "2026-10-18T01:15:00-05:00", "estimatedArrival": "2026-10-18T01:15:00-05:00",
         "delayMinutes": 0, "alerts": [],
         "aircraft": "Boeing 737-800", "baggageCarousel": "TBD",
         "baseFare": Decimal("334"), "fareClass": "ECONOMY"},

        # Option C: Next day morning — cheaper fare, plenty of seats but no adjacent group
        {"flightNumber": "SW982", "date": "2026-10-18", "status": "ON_TIME",
         "route": "MEX-DFW", "departureAirport": "MEX", "arrivalAirport": "DFW",
         "departureGate": "B5", "arrivalGate": "TBD", "terminal": "B",
         "scheduledDeparture": "2026-10-18T08:00:00-05:00", "estimatedDeparture": "2026-10-18T08:00:00-05:00",
         "scheduledArrival": "2026-10-18T11:45:00-05:00", "estimatedArrival": "2026-10-18T11:45:00-05:00",
         "delayMinutes": 0, "alerts": [],
         "aircraft": "Airbus A321", "baggageCarousel": "TBD",
         "baseFare": Decimal("249"), "fareClass": "ECONOMY"},
    ]

    for s in statuses:
        FLIGHT_STATUS.put_item(Item={
            "PK": f"FLIGHT#{s['flightNumber']}#{s['date']}",
            "SK": "STATUS",
            **s,
            "lastUpdated": datetime.utcnow().isoformat() + "Z",
        })
    print(f"    {len(statuses)} flight statuses seeded (1 delayed + 3 alternatives for rebooking)")


def main():
    parser = argparse.ArgumentParser(description="Seed Airline Concierge sample data")
    parser.add_argument("--user-email", type=str, default=None,
                        help="Email for the customer profile (used for SES notifications)")
    parser.add_argument("--user-name", type=str, default=None,
                        help="Name for the customer profile (e.g. \"Alex Johnson\")")
    args = parser.parse_args()

    print("\n🌱 Seeding Airline Concierge data\n")

    seed_customer(email=args.user_email, name=args.user_name)
    seed_flight_bookings()
    seed_seat_map()
    seed_passengers(customer_name=args.user_name)
    seed_flight_status()
    seed_purchase_history()
    seed_preferences()

    print("\n✅ Data seeding complete\n")


if __name__ == "__main__":
    main()
