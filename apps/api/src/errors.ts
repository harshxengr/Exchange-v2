export class ApiError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string,
    ) {
        super(message);

        this.name = 'ApiError';
    }
}

export class BadRequestError
    extends ApiError {
    constructor(message: string) {
        super(400, message);
    }
}

export class UnauthorizedError
    extends ApiError {
    constructor(message = 'Unauthorized') {
        super(401, message);
    }
}

export class NotFoundError
    extends ApiError {
    constructor(message: string) {
        super(404, message);
    }
}

export class ConflictError
    extends ApiError {
    constructor(message: string) {
        super(409, message);
    }
}