import {
    z,
} from 'zod';

const emailSchema =
    z
        .string()
        .trim()
        .email()
        .max(320);

const passwordSchema =
    z
        .string()
        .min(
            8,
            'password must be at least 8 characters',
        )
        .max(
            128,
            'password is too long',
        );

export const registerSchema =
    z.object({
        email:
            emailSchema,

        password:
            passwordSchema,
    });

export const loginSchema =
    z.object({
        email:
            emailSchema,

        password:
            passwordSchema,
    });

export type RegisterInput =
    z.infer<
        typeof registerSchema
    >;

export type LoginInput =
    z.infer<
        typeof loginSchema
    >;