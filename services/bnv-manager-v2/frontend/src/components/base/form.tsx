import React from "react";

/**
 * The properties for {@link Form}
 */
export type FormProps = {
    /** The class names */
    className?: string;
    /** The action that should run when pressing submitting the form */
    onSubmit: () => void;
    /** The child elements of the form */
    children?: React.ReactNode | Array<React.ReactNode>;
    /** Optional ref */
    ref?: React.ForwardedRef<HTMLFormElement>;
};

/**
 * A simple form to make declaring easier
 */
export default function Form(props: FormProps) {
    return (
        <form
            className={props.className}
            method={"post"}
            onSubmit={(e) => {
                e.preventDefault();
                props.onSubmit();
            }}
            ref={props.ref}
        >
            {props.children}
        </form>
    );
}
