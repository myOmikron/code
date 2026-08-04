/**
 * A [Rust](https://doc.rust-lang.org/std/result/enum.Result.html) inspired type for error handling
 *
 * `Result` is a type that represents either success ([`Ok`]{@link Ok}) or failure ([`Err`]{@link Err}).
 */
export type Result<T, E> = (OkInterface<T> | ErrInterface<E>) & ResultInterface<T, E>;

/** Fields and methods specific to an `Ok` */
export interface OkInterface<T> {
    /** The stored value */
    ok: T;

    /**
     * `true` if the result is [`Ok`]{@link Ok}
     *
     * This field can be used by typescript to narrow a result's type:
     * ```ts
     * function example(result: Result<any, any>) {
     *  if (result.isOk) {
     *      console.log(result.ok); // typescript narrowed `result` to be of type `Ok`
     *  } else {
     *      console.log(result.err); // typescript narrowed `result` to be of type `Err`
     *  }
     * }
     * ```
     */
    isOk: true;

    /**
     * `true` if the result is [`Err`]{@link Err}
     *
     * This field can be used by typescript to narrow a result's type:
     * ```ts
     * function example(result: Result<any, any>) {
     *  if (result.isErr) {
     *      console.log(result.err); // typescript narrowed `result` to be of type `Err`
     *  } else {
     *      console.log(result.ok); // typescript narrowed `result` to be of type `Ok`
     *  }
     * }
     * ```
     */
    isErr: false;

    /**
     * Casts the `Err` type into any `E`
     *
     * @returns the same value as `this` but with a different type
     */
    cast<E>(): Result<T, E> & OkInterface<T>;
}

/** Fields and methods specific to an `Err` */
export interface ErrInterface<E> {
    /** The stored error value */
    err: E;

    /**
     * `true` if the result is [`Ok`]{@link Ok}
     *
     * This field can be used by typescript to narrow a result's type:
     * ```ts
     * function example(result: Result<any, any>) {
     *  if (result.isOk) {
     *      console.log(result.ok); // typescript narrowed `result` to be of type `Ok`
     *  } else {
     *      console.log(result.err); // typescript narrowed `result` to be of type `Err`
     *  }
     * }
     * ```
     */
    isOk: false;

    /**
     * `true` if the result is [`Err`]{@link Err}
     *
     * This field can be used by typescript to narrow a result's type:
     * ```ts
     * function example(result: Result<any, any>) {
     *  if (result.isErr) {
     *      console.log(result.err); // typescript narrowed `result` to be of type `Err`
     *  } else {
     *      console.log(result.ok); // typescript narrowed `result` to be of type `Ok`
     *  }
     * }
     * ```
     */
    isErr: true;

    /**
     * Casts the `Ok` type into any `T`
     *
     * @returns the same value as `this` but with a different type
     */
    cast<T>(): Result<T, E> & ErrInterface<E>;
}

/** Methods shared by all `Result`s */
export interface ResultInterface<T, E> {
    /**
     * Calls one of `ifOk` or `ifErr` depending on the result's value.
     *
     * The called function is passed its appropriate value.
     *
     * @param ifOk function to call if `this` is `Ok`
     * @param ifErr function to call if `this` is `Err`
     * @returns the return value of either `ifOk` or `ifErr`
     */
    match<R>(ifOk: (ok: T) => R, ifErr: (err: E) => R): R;

    /**
     * Calls `func` if the result is `Ok`, otherwise returns the `Err` value of `this`.
     *
     * This function can be used for control flow based on `Result` values.
     *
     * @param func function to process the `OK` value
     * @returns the original `Err` or `func`'s return value
     */
    andThen<U>(func: (ok: T) => Result<U, E>): Result<U, E>;

    /**
     * Maps a `Result<T, E>` to `Result<U, E>` by applying a function to a contained `Ok` value, leaving an `Err` value untouched.
     *
     * This function can be used to compose the results of two functions.
     *
     * @param func function to apply to a potential `Ok`
     * @returns the mapped result
     */
    map<U>(func: (ok: T) => U): Result<U, E>;

    /**
     * Maps a `Result<T, E>` to `Result<T, F>` by applying a function to a contained `Err` value, leaving an `Ok` value untouched.
     *
     * This function can be used to pass through a successful result while handling an error.
     *
     * @param func function to apply to a potential `Err`
     * @returns the mapped result
     */
    mapErr<F>(func: (err: E) => F): Result<T, F>;

    /**
     * Returns the contained `Ok` value, consuming the `this` value.
     *
     * Because this method may panic, its use is generally discouraged.
     * Instead, prefer to use pattern matching and handle the `Err` case explicitly,
     * or call `unwrapOr` or `unwrapOrElse`.
     *
     * @returns the success value
     * @throws {UnwrapError<E>} if the value is an `Err`, with a panic message provided by the `Err`’s `toString()` implementation.
     */
    unwrap(): T;

    /**
     * Returns the contained `Ok` value or a provided `default_`.
     *
     * Arguments passed to `unwrapOr` are eagerly evaluated; if you are passing the result of a function call,
     * it is recommended to use `unwrapOrElse`, which is lazily evaluated.
     *
     * @returns the success or default value
     * @param default_ a default value to return in case of an `Err`
     */
    unwrapOr(default_: T): T;

    /**
     * Returns the contained `Ok` value or computes it from a closure.
     *
     * @returns the success or default value
     * @param default_ a function producing a default value in case of an `Err`
     */
    unwrapOrElse(default_: () => T): T;
}

/** Namespace of helper function operating on `Result`s */
export const Result = {
    /**
     * Takes each element in the iterable of `Result`s:
     * - if it is an `Err`, no further elements are taken, and the `Err` is returned
     * - should no `Err` occur, an array with the values of each `Result` is returned
     *
     * @param iterable an iterable yielding results
     * @returns `Ok` if all elements were `Ok` or the first `Err`
     */
    collect<T, E>(iterable: Iterable<Result<T, E>>): Result<Array<T>, E> {
        const array = [];
        for (const result of iterable) {
            if (result.isOk) {
                array.push(result.ok);
            } else {
                return result.cast();
            }
        }
        return new Ok(array);
    },
};

// The following functions are just implementations of ResultImpl
// and don't need to be fully documented

/* eslint-disable jsdoc/require-returns */

/* eslint-disable jsdoc/require-param */

/** A [`Result`]{@link Result}'s `Ok` variant containing the success value */
export class Ok<T, E> implements OkInterface<T>, ResultInterface<T, E> {
    ok: T;
    isOk = true as const;
    isErr = false as const;

    /** Wraps a success value in an `Ok` */
    constructor(ok: T) {
        this.ok = ok;
    }

    /** Implementation of [`Result.match`]{@link ResultInterface#match} */
    match<R>(ifOk: (ok: T) => R, _ifErr: (err: E) => R): R {
        return ifOk(this.ok);
    }

    /** Implementation of [`Result.andThen`]{@link ResultInterface#andThen} */
    andThen<U>(func: (ok: T) => Result<U, E>): Result<U, E> {
        return func(this.ok);
    }

    /** Implementation of [`Result.map`]{@link ResultInterface#map} */
    map<U>(func: (ok: T) => U): Result<U, E> {
        return new Ok(func(this.ok));
    }

    /** Implementation of [`Result.mapErr`]{@link ResultInterface#mapErr} */
    mapErr<F>(_func: (err: E) => F): Result<T, F> {
        return new Ok(this.ok);
    }

    /** Implementation of [`Result.unwrap`]{@link ResultInterface#unwrap} */
    unwrap(): T {
        return this.ok;
    }

    /** Implementation of [`Result.unwrapOr`]{@link ResultInterface#unwrapOr} */
    unwrapOr(_: T): T {
        return this.ok;
    }

    /** Implementation of [`Result.unwrapOrElse`]{@link ResultInterface#unwrapOrElse} */
    unwrapOrElse(_: () => T): T {
        return this.ok;
    }

    /**
     * Casts the `Err` type into any `E`
     */
    cast<E>(): Result<T, E> & OkInterface<T> {
        return new Ok(this.ok);
    }
}

/** A [`Result`]{@link Result}'s `Err` variant containing the error value */
export class Err<T, E> implements ErrInterface<E>, ResultInterface<T, E> {
    err: E;
    isOk = false as const;
    isErr = true as const;

    /** Wraps a error value in an `Err` */
    constructor(err: E) {
        this.err = err;
    }

    /** Implementation of [`Result.match`]{@link ResultInterface#match} */
    match<R>(ifOk: (ok: T) => R, ifErr: (err: E) => R): R {
        return ifErr(this.err);
    }

    /** Implementation of [`Result.andThen`]{@link ResultInterface#andThen} */
    andThen<U>(_func: (ok: T) => Result<U, E>): Result<U, E> {
        return new Err(this.err);
    }

    /** Implementation of [`Result.map`]{@link ResultInterface#map} */
    map<U>(_func: (ok: T) => U): Result<U, E> {
        return new Err(this.err);
    }

    /** Implementation of [`Result.mapErr`]{@link ResultInterface#mapErr} */
    mapErr<F>(func: (err: E) => F): Result<T, F> {
        return new Err(func(this.err));
    }

    /** Implementation of [`Result.unwrap`]{@link ResultInterface#unwrap} */
    unwrap(): T {
        throw new UnwrapError(this.err);
    }

    /** Implementation of [`Result.unwrapOr`]{@link ResultInterface#unwrapOr} */
    unwrapOr(default_: T): T {
        return default_;
    }

    /** Implementation of [`Result.unwrapOrElse`]{@link ResultInterface#unwrapOrElse} */
    unwrapOrElse(default_: () => T): T {
        return default_();
    }

    /**
     * Casts the `Ok` type into any `T`
     */
    cast<T>(): Result<T, E> & ErrInterface<E> {
        return new Err(this.err);
    }
}

/**
 * [`Error`]{@link Error} thrown by [`Result.unwrap`]{@link ResultInterface#unwrap} in case of `Err`
 *
 * It contains the error value as well a nice error message.
 */
export class UnwrapError<E> extends Error {
    /** The error value */
    value: E;

    /**
     * Constructs a new `UnwrapError`
     *
     * @param value the error value
     */
    constructor(value: E) {
        super("Called `unwrap` on an `Err` with value: " + value);
        this.value = value;
    }
}
