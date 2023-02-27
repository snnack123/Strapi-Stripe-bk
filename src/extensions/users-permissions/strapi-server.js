const { confirmAccountSchema, resetPasswordSchema, verifyTokenSchema, resetPasswordWithTokenSchema, verifyConfirmAccountSchema, subscriptionSchema } = require('../utils/schemas');
const { checkStrapiToken, generateConfirmationToken, checkTokenIsExpired } = require('../utils/utilFunctions');
const { MILLISECONDS_PER_DAY } = require('../utils/constants');
const { generateRandomInteger } = require('../utils/crypto');
const routes = require('./config/routes');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = (plugin) => {
  plugin.controllers.auth.subscribe = async (ctx) => {
    try {
      const { email, subscriptionType } = ctx.request.body;

      //check if subscription object is valid
      await subscriptionSchema.validate(ctx.request.body);

      //find user in strapi by stripeId
      const user = await strapi.query("plugin::users-permissions.user").findOne({
        where: {
          email: email,
        },
      });

      //check if user has active subscription
      const foundSubscription = await stripe.subscriptions.list({
        customer: user.stripeId,
        status: 'active',
        limit: 1,
      })

      if (!foundSubscription.data.length > 0) {
        //user has no active subscription, create new one
        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price: process.env['SUBSCRIPTION_PRICE_ID_' + subscriptionType.toUpperCase()],
              quantity: 1,
            },
          ],
          mode: 'subscription',
          payment_method_types: ['card'],
          success_url: 'http://localhost:3000/success',
          cancel_url: 'http://localhost:3000/cancel',
          customer: user.stripeId,
        });

        ctx.body = {
          state: false,
          url: session.url,
          periodStart: null,
          periodEnd: null
        };
      } else {
        //user has active subscription, return subscription data
        ctx.body = {
          state: true,
          url: "",
          periodStart: foundSubscription.data[0].current_period_start,
          periodEnd: foundSubscription.data[0].current_period_end
        };
      }

      ctx.status = 200;
    } catch (err) {
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: err };
      console.log(err);
    }
  };

  plugin.controllers.auth.getUserData = async (ctx) => {
    try {
      const { id, exp } = await checkStrapiToken(ctx);

      //check if token is expired
      const tokenExpired = checkTokenIsExpired(exp);

      if (!tokenExpired.status) {
        ctx.status = 401;
        ctx.body = { status: false, message: 'Token expired', error: "" };
        return;
      }

      //get user data
      const userData = await strapi.query("plugin::users-permissions.user").findOne({
        where: {
          id: id,
        },
      });

      const returnMessage = {
        status: true,
        message: 'User data',
        error: "",
        data: userData,
        confirmationMailSent: userData.confirmationToken ? true : false
      };

      //remove sensitive data
      delete userData.provider;
      delete userData.password;
      delete userData.resetPasswordToken;
      delete userData.resetPasswordTokenExp;
      delete userData.confirmationToken;
      delete userData.updatedAt;
      delete userData.createdAt;

      //send user data
      ctx.status = 200;
      ctx.body = returnMessage;
    } catch (err) {
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: err };
      console.log(err);
    }
  }

  plugin.controllers.auth.emailConfirmation = async (ctx) => {
    try {
      const { email } = ctx.request.body;

      //get user data
      const userData = await strapi.query("plugin::users-permissions.user").findOne({
        where: {
          email: email,
        },
      });

      const confirmationToken = generateConfirmationToken();

      await strapi.entityService.update('plugin::users-permissions.user', userData.id,
        {
          data: {
            confirmationToken: String(confirmationToken),
          },
        },
      );

      const sentEmail = await strapi.plugin('email-designer').service('email').sendTemplatedEmail(
        {
          to: userData.email,
          from: process.env.EMAILS_FROM,
          replyTo: process.env.EMAILS_FROM,
        },
        {
          templateReferenceId: 101,
        },
        {
          USER_NAME: userData.username,
          CONFIRM_PASSWORD_LINK: `${process.env.FRONTEND_URL}/email-confirmation?token=${confirmationToken}`,
        },
      );

      if (sentEmail.accepted.length > 0) {
        ctx.status = 200;
        ctx.body = { status: true, message: 'Email sent', error: "" };
      } else {
        ctx.status = 500;
        ctx.body = { status: false, message: 'Email not sent', error: "" };
      }
    } catch (err) {
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: err };
      console.log(err)
    }
  }

  plugin.controllers.auth.confirmAccount = async (ctx) => {
    try {
      const body = ctx.request.body;
      await confirmAccountSchema.validate(body);

      const { confirmationToken } = body;

      const { id } = await checkStrapiToken(ctx);

      //get user data
      const userData = await strapi.query("plugin::users-permissions.user").findOne({
        where: {
          id: id,
        },
      });

      if (userData.confirmationToken === confirmationToken) {
        await strapi.entityService.update('plugin::users-permissions.user', id,
          {
            data: {
              confirmedAccount: true,
              confirmationToken: null,
            },
          },
        );

        delete userData.provider;
        delete userData.password;
        delete userData.resetPasswordToken;
        delete userData.resetPasswordTokenExp;
        delete userData.confirmationToken;
        delete userData.updatedAt;
        delete userData.createdAt;

        ctx.status = 200;
        ctx.body = { status: true, message: 'Account confirmed', error: "", data: userData };
      } else {
        ctx.status = 401;
        ctx.body = { status: false, message: 'Invalid confirmation token', error: "" };
      }
    } catch (err) {
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: err };
      console.log(err)
    }
  }

  plugin.controllers.auth.findStripeUser = async (ctx) => {
    try {
      let stripeId = null;
      const foundCustomer = await stripe.customers.list({
        email: ctx.request.body.email,
        limit: 1,
      });

      //find user in strapi by email
      const foundUser = await strapi.query("plugin::users-permissions.user").findOne({
        where: {
          email: ctx.request.body.email,
        },
      });

      if (!foundCustomer.data.length > 0) {
        const createdUser = await stripe.customers.create({
          email: ctx.request.body.email,
          name: foundUser?.name ? foundUser.name : '',
        });
        stripeId = createdUser.id;
      } else {
        stripeId = foundCustomer.data[0].id;
      }

      const { id } = await strapi.plugins['users-permissions'].services.jwt.getToken(ctx);
      //update user with stripeId
      await strapi.entityService.update('plugin::users-permissions.user', id,
        {
          data: {
            stripeId: stripeId,
          },
        });

      ctx.status = 200;
      ctx.body = { status: true, message: '', error: "", stripeId: stripeId };

    } catch (err) {
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: err, stripeId: "" };
      console.log(err);
    }
  }

  plugin.controllers.auth.sendResetPasswordEmail = async (ctx) => {
    try {
      const body = ctx.request.body;
      await resetPasswordSchema.validate(body);

      const { email } = body;

      //get user data
      const userData = await strapi.query("plugin::users-permissions.user").findOne({
        where: {
          email: email,
        },
      });

      if (userData?.id) {
        const checkedToken = userData.resetPasswordToken ? checkTokenIsExpired(userData.resetPasswordTokenExp) : false;
        if (!checkedToken) {
          const resetPasswordToken = generateRandomInteger().toString();
          const resetPasswordCodeExpiresAt = new Date(
            Date.now() + MILLISECONDS_PER_DAY,
          );

          await strapi.entityService.update('plugin::users-permissions.user', userData.id,
            {
              data: {
                resetPasswordToken: String(resetPasswordToken),
                resetPasswordTokenExp: resetPasswordCodeExpiresAt,
              },
            },
          );

          await strapi.plugin('email-designer').service('email').sendTemplatedEmail(
            {
              to: userData.email,
              from: process.env.EMAILS_FROM,
              replyTo: process.env.EMAILS_FROM,
            },
            {
              templateReferenceId: 102,
            },
            {
              USER_NAME: userData.username,
              RESET_PASSWORD_LINK: `${process.env.FRONTEND_URL}/new-password?token=${resetPasswordToken}`,
            },
          );
        }

      }

      ctx.status = 200;
      ctx.body = { status: true, message: 'Email sent', error: "" };

    } catch (err) {
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: err };
      console.log(err);
    }
  }

  plugin.controllers.auth.verifyConfirmAccountToken = async (ctx) => {
    try {
      const body = ctx.request.body;
      await verifyConfirmAccountSchema.validate(body);
      const { token } = body;

      const userData = await strapi.query("plugin::users-permissions.user").findOne({
        where: {
          confirmationToken: token,
        },
        populate: ['log'],
      });

      if (!userData || userData.blocked) {
        return ctx.send({ ok: false });
      }

      //confirm account
      await strapi.entityService.update('plugin::users-permissions.user', userData.id,
        {
          data: {
            confirmedAccount: true,
            confirmationToken: null,
            log: [...userData.log, { type: 'confirmed', date: new Date() }]
          },
        },
      );

      return ctx.send({ ok: true });
    } catch (err) {
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: err };
      console.log(err);
    }
  }

  plugin.controllers.auth.verifyResetPasswordToken = async (ctx) => {
    try {
      const body = ctx.request.body;
      await verifyTokenSchema.validate(body);
      const { token } = body;

      const userData = await strapi.query("plugin::users-permissions.user").findOne({
        where: {
          resetPasswordToken: token,
        },
      });

      if (!userData || userData.blocked) {
        return ctx.send({ ok: false });
      }

      if (new Date() > new Date(userData.resetPasswordTokenExp)) {
        return ctx.send({ ok: false });
      }

      return ctx.send({ ok: true });
    } catch (err) {
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: err };
      console.log(err);
    }
  }

  plugin.controllers.auth.resetPassword = async (ctx) => {
    try {
      const body = ctx.request.body;
      await resetPasswordWithTokenSchema.validate(body);

      const { code, password } = body;

      const userData = await strapi.query("plugin::users-permissions.user").findOne({
        where: {
          resetPasswordToken: code,
        },
      });

      if (userData?.id) {
        await strapi.entityService.update('plugin::users-permissions.user', userData.id,
          {
            data: {
              password: password,
              resetPasswordToken: null,
              resetPasswordTokenExp: null,
            },
          },
        );
      }

      ctx.status = 200;
      ctx.body = { status: true, message: 'Password reset', error: "" };
    } catch (err) {
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: err };
      console.log(err);
    }
  }

  routes.forEach((route) => {
    return plugin.routes['content-api'].routes.push(route);
  });

  return plugin;
};