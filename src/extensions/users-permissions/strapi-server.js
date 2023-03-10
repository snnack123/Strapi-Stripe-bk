const { confirmAccountSchema, resetPasswordSchema, verifyTokenSchema, resetPasswordWithTokenSchema, verifyConfirmAccountSchema, subscriptionSchema } = require('../utils/schemas');
const { checkStrapiToken, generateConfirmationToken, checkTokenIsExpired, findStripeUser } = require('../utils/utilFunctions');
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
      delete userData.stripeId;

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

  plugin.controllers.auth.findOrCreateStripeUser = async (ctx) => {
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

  plugin.controllers.auth.refreshToken = async (ctx) => {
    console.log('Refresh token')
    try {
      const { id } = await checkStrapiToken(ctx);

      const foundUser = await strapi.query("plugin::users-permissions.user").findOne({
        where: {
          id: id,
        },
      });

      if (foundUser) {
        const newToken = await strapi.plugins['users-permissions'].services.jwt.issue({
          id: foundUser.id,
        });

        console.log('New token: ', newToken);

        ctx.status = 200;
        ctx.body = { status: true, message: '', error: "", token: newToken };
      } else {
        ctx.status = 200;
        ctx.body = { status: false, message: '', error: "", token: "" };
      }
    } catch (error) {
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: error };
      console.log(error);
    }
  }

  plugin.controllers.auth.getSubscriptionPlans = async (ctx) => {
    try {
      const {customer, foundUser} = await findStripeUser(ctx, stripe);

      // get all payment methods for customer
      const customerPaymentMethods = await stripe.paymentMethods.list({
        customer: foundUser.stripeId,
      });

      const defaultPaymentMethod = customer.invoice_settings.default_payment_method || null;
      const defaultCard = customerPaymentMethods !== null ? customerPaymentMethods.data.find((method) => method.id === defaultPaymentMethod) : customerPaymentMethods.data[0];

      // extract active subscription plan id
      const customerPlanId = customer?.subscriptions?.data[0]?.plan.product || '';
      let customerPlanName = '';

      // get all active plans from stripe
      const foundSubscriptions = await stripe.plans.list({ active: true, expand: ['data.product'] });
      const customerPayments = await stripe.paymentIntents.list({customer:foundUser.stripeId});

      const subscriptionPlans = foundSubscriptions.data.map((plan) => {
        // find active plan name
        if (plan.product.id === customerPlanId) {
          customerPlanName = plan.product.name;
        }

        return {
          name: plan.product.name,
          amount: plan.amount / 100,
          amountOnYear: plan.amount * 12 / 100,
          currency: plan.currency,
          interval: plan.interval,
        }
      });

      const payments = await Promise.all(
        customerPayments.data.map(async (payment) => {
          const invoice = await stripe.invoices.retrieve(payment.invoice);
          
          return {
            date: payment.created,
            amount: payment.amount / 100,
            currency: payment.currency,
            status: payment.status,
            description: payment.description,
            invoice: invoice.hosted_invoice_url,
          }
        }
      ));

      ctx.status = 200;
      ctx.body = { 
        status: true, 
        data: { 
          activePlan: {
            name: customerPlanName,
            expireDate: customer?.subscriptions?.data[0]?.current_period_end,
            type: customer?.subscriptions?.data[0]?.plan.interval,
          },
          plans: subscriptionPlans, 
          payments: payments,
          card: {
            last4: defaultCard.card?.last4,
            expMonth: defaultCard.card?.exp_month,
            expYear: defaultCard.card?.exp_year,
            brand: defaultCard.card?.brand,
          }
        }
      };
    } catch (error) {
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: error };
      console.log(error);
    }
  }

  plugin.controllers.auth.createCreditCard = async (ctx) => {
    try {
      const {customer} = await findStripeUser(ctx, stripe);

      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        payment_method_types: ['card'],
        mode: 'setup',
        success_url: `${process.env.FRONTEND_URL}/settings?type=billing`,
        cancel_url: `${process.env.FRONTEND_URL}/settings?type=billing`,
      });

      // const session = await stripe.billingPortal.sessions.create({
      //   customer: customer.id,
      //   return_url: 'https://your-website.com/account',
      // });

      ctx.status = 200;
      ctx.body = { status: true, message: 'Credit card updated', error: "", url: session.url };
    } catch (error) {
      console.log(error);
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: error };
    }
  }

  plugin.controllers.auth.editCreditCard = async (ctx) => {
    try {
      const {customer} = await findStripeUser(ctx, stripe);

      const session = await stripe.billingPortal.sessions.create({
        customer: customer.id,
        return_url: `${process.env.FRONTEND_URL}/settings?type=billing`,
      });

      ctx.status = 200;
      ctx.body = { status: true, message: 'Credit card updated', error: "", url: session.url };
    } catch (error) {
      console.log(error);
      ctx.status = 400;
      ctx.body = { status: false, message: 'Invalid request', error: error };
    }
  }

  routes.forEach((route) => {
    return plugin.routes['content-api'].routes.push(route);
  });

  return plugin;
};