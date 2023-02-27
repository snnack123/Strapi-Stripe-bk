const yup = require('yup');

const confirmAccountSchema = yup.object({
    confirmationToken: yup.number().required(),
});

const resetPasswordSchema = yup.object({
    email: yup.string().email().required(),
})

const verifyTokenSchema = yup.object({
    token: yup.number().required().min(100000).max(999999),
})

const verifyConfirmAccountSchema = yup.object({
    token: yup.number().required().min(0),
})

const resetPasswordWithTokenSchema = yup.object({
    password: yup.string().required(),
    passwordConfirmation: yup.string().required().oneOf([yup.ref('password')], 'Passwords must match'),
    code: yup.number().required().min(100000).max(999999),
});

const subscriptionSchema = yup.object({
    email: yup.string().email().required(),
    subscriptionType: yup.string().required(),
})

module.exports = {
    confirmAccountSchema,
    resetPasswordSchema,
    verifyTokenSchema,
    resetPasswordWithTokenSchema,
    verifyConfirmAccountSchema,
    subscriptionSchema
}