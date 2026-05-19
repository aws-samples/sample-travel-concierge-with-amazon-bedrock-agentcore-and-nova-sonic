#!/bin/bash

# Reset Cognito User Password
# This script sets a permanent password for the AppUser

USER_POOL_ID="us-east-1_bSemMmIRB"
USERNAME="AppUser"
NEW_PASSWORD="TravelDemo123!"

echo "Resetting password for user: $USERNAME"
echo "User Pool ID: $USER_POOL_ID"
echo ""

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USERNAME" \
  --password "$NEW_PASSWORD" \
  --permanent \
  --region us-east-1

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Password reset successfully!"
  echo ""
  echo "Login credentials:"
  echo "  Username: $USERNAME"
  echo "  Password: $NEW_PASSWORD"
  echo ""
  echo "You can now login at: https://main.d3p1rhf23qdck0.amplifyapp.com"
else
  echo ""
  echo "❌ Password reset failed"
  echo ""
  echo "Please run this command manually:"
  echo "aws cognito-idp admin-set-user-password --user-pool-id $USER_POOL_ID --username $USERNAME --password \"$NEW_PASSWORD\" --permanent --region us-east-1"
fi
