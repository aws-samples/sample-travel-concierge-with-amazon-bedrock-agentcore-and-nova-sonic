#!/usr/bin/env python3
"""Clean up all seeded data from DynamoDB tables."""
import boto3
import argparse

dynamodb = boto3.resource("dynamodb")

TABLES = ["TH-Customers", "TH-Bookings", "TH-SeatMap", "TH-Passengers", "TH-PurchaseHistory", "TH-Preferences"]


def clear_table(table_name):
    table = dynamodb.Table(table_name)
    scan = table.scan()
    items = scan.get("Items", [])

    key_schema = table.key_schema
    key_names = [k["AttributeName"] for k in key_schema]

    with table.batch_writer() as batch:
        for item in items:
            key = {k: item[k] for k in key_names}
            batch.delete_item(Key=key)

    print(f"  Cleared {len(items)} items from {table_name}")


def main():
    parser = argparse.ArgumentParser(description="Clean up T&H sample data")
    parser.add_argument("--force", action="store_true", help="Skip confirmation")
    args = parser.parse_args()

    if not args.force:
        confirm = input("⚠️  This will delete ALL data from TH-* tables. Continue? (yes/no): ")
        if confirm.lower() not in ("yes", "y"):
            print("Cancelled.")
            return

    print("\n🧹 Cleaning up Travel data\n")
    for table_name in TABLES:
        try:
            clear_table(table_name)
        except Exception as e:
            print(f"  ⚠️  Error clearing {table_name}: {e}")

    print("\n✅ Cleanup complete\n")


if __name__ == "__main__":
    main()
