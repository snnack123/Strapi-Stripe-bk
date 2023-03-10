
const routes =
  [
    {
      "method": "POST",
      "path": "/subscribe",
      "handler": "auth.subscribe",
      "config": {
        "prefix": "",
        "description": "Subscribe user to a plan",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "subscribe"
        }
      }
    },
    {
      "method": "POST",
      "path": "/user-data",
      "handler": "auth.getUserData",
      "config": {
        "prefix": "",
        "description": "Get user data",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "getUserData"
        }
      }
    },
    {
      "method": "POST",
      "path": "/email-confirmation",
      "handler": "auth.emailConfirmation",
      "config": {
        "prefix": "",
        "description": "Email confirmation",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "emailConfirmation"
        }
      }
    },
    {
      "method": "POST",
      "path": "/confirm-account",
      "handler": "auth.confirmAccount",
      "config": {
        "prefix": "",
        "description": "Confirm account",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "confirmAccount"
        }
      }
    },
    {
      "method": "POST",
      "path": "/find-stripe-user",
      "handler": "auth.findOrCreateStripeUser",
      "config": {
        "prefix": "",
        "description": "Find stripe user",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "findOrCreateStripeUser"
        }
      }
    },
    {
      "method": "POST",
      "path": "/send-reset-password-email",
      "handler": "auth.sendResetPasswordEmail",
      "config": {
        "prefix": "",
        "description": "Send reset password email",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "sendResetPasswordEmail"
        }
      }
    },
    {
      "method": "POST",
      "path": "/verify-reset-password-token",
      "handler": "auth.verifyResetPasswordToken",
      "config": {
        "prefix": "",
        "description": "Verify reset password token",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "verifyResetPasswordToken"
        }
      }
    },
    {
      "method": "POST",
      "path": "/verify-confirm-account-token",
      "handler": "auth.verifyConfirmAccountToken",
      "config": {
        "prefix": "",
        "description": "Verify confirm account token",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "verifyConfirmAccountToken"
        }
      }
    },
    {
      "method": "POST",
      "path": "/reset-password",
      "handler": "auth.resetPassword",
      "config": {
        "prefix": "",
        "description": "Reset password",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "resetPassword"
        }
      }
    },
    {
      "method": "POST",
      "path": "/refresh-token",
      "handler": "auth.refreshToken",
      "config": {
        "prefix": "",
        "description": "Refresh token",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "refreshToken"
        }
      }
    },
    {
      "method": "GET",
      "path": "/subscription-plans",
      "handler": "auth.getSubscriptionPlans",
      "config": {
        "prefix": "",
        "description": "Get subscription plans",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "getSubscriptionPlans"
        }
      }
    },
    {
      "method": "POST",
      "path": "/create-card",
      "handler": "auth.createCreditCard",
      "config": {
        "prefix": "",
        "description": "Create credit card",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "createCreditCard"
        }
      }
    },
    {
      "method": "POST",
      "path": "/edit-card",
      "handler": "auth.editCreditCard",
      "config": {
        "prefix": "",
        "description": "Edit credit card",
        "tag": {
          "name": "Auth",
          "plugin": "User-Permissions",
          "actionType": "editCreditCard"
        }
      }
    }
  ]

module.exports = routes;