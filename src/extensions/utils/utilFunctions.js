const checkStrapiToken = async (ctx) => {
    const { id, exp } = await strapi.plugins['users-permissions'].services.jwt.getToken(ctx);
    return { id, exp };
}

const checkTokenIsExpired = (exp) => {
    if (exp !== null && exp < Date.now() / 1000) {
        return { status: false, message: 'Token expired', error: "" };
    }

    return { status: true, message: 'Token is valid', error: "" };
}

const generateConfirmationToken = () => {
    return Math.floor(Math.random() * 9000000);
}

const findStripeUser = async (ctx, stripe) => {
    try {
        const { id } = await checkStrapiToken(ctx);

        const foundUser = await strapi.query("plugin::users-permissions.user").findOne({
            where: {
                id: id,
            },
        });
    
        const customer = await stripe.customers.retrieve(
            foundUser.stripeId,
            { expand: ['subscriptions'] }
        );
    
        return {customer, foundUser};
    } catch (error) {
        console.log(error);
        return { status: false, message: 'Error finding stripe user', error: error };
    }
}

module.exports = {
    checkStrapiToken,
    checkTokenIsExpired,
    generateConfirmationToken,
    findStripeUser
}