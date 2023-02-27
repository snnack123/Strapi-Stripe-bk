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

module.exports = {
    checkStrapiToken,
    checkTokenIsExpired,
    generateConfirmationToken
}