import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import {
    prisma,
} from '@exchange/db';

import {
    config,
} from '../config.js';

export type AuthUser = {
    id: string;
    email: string;
};

export type AuthResult = {
    token: string;
    user: AuthUser;
};

/*
 * jsonwebtoken's expiresIn type can include undefined.
 *
 * Our configuration guarantees that a value exists,
 * so we narrow it to the actual usable type here.
 */
type JwtExpiresIn =
    NonNullable<
        jwt.SignOptions['expiresIn']
    >;

function signToken(
    user: AuthUser,
): string {
    const payload = {
        sub:
            user.id,

        email:
            user.email,
    };

    const expiresIn =
        config.jwtExpiresIn as JwtExpiresIn;

    return jwt.sign(
        payload,
        config.jwtSecret,
        {
            expiresIn,
        },
    );
}

export async function registerUser(
    email: string,
    password: string,
): Promise<AuthResult> {
    const normalizedEmail =
        email
            .trim()
            .toLowerCase();

    const existing =
        await prisma.user.findUnique({
            where: {
                email:
                    normalizedEmail,
            },
        });

    if (existing) {
        throw new Error(
            'EMAIL_ALREADY_REGISTERED',
        );
    }

    const passwordHash =
        await bcrypt.hash(
            password,
            12,
        );

    const user =
        await prisma.user.create({
            data: {
                email:
                    normalizedEmail,

                passwordHash,
            },
        });

    const authUser: AuthUser = {
        id:
            user.id,

        email:
            user.email,
    };

    return {
        token:
            signToken(
                authUser,
            ),

        user:
            authUser,
    };
}

export async function loginUser(
    email: string,
    password: string,
): Promise<AuthResult> {
    const normalizedEmail =
        email
            .trim()
            .toLowerCase();

    const user =
        await prisma.user.findUnique({
            where: {
                email:
                    normalizedEmail,
            },
        });

    /*
     * Don't reveal whether an email
     * exists in the database.
     */
    if (!user) {
        throw new Error(
            'INVALID_CREDENTIALS',
        );
    }

    const validPassword =
        await bcrypt.compare(
            password,
            user.passwordHash,
        );

    if (!validPassword) {
        throw new Error(
            'INVALID_CREDENTIALS',
        );
    }

    const authUser: AuthUser = {
        id:
            user.id,

        email:
            user.email,
    };

    return {
        token:
            signToken(
                authUser,
            ),

        user:
            authUser,
    };
}