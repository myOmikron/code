import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Props for {@link ProfileIndex}
 */
export type ProfileIndexProps = {};

/**
 * Index for the profile
 */
export default function ProfileIndex(props: ProfileIndexProps) {
    return <Navigate to={"/profile/general"} />;
}

export const Route = createFileRoute("/_menu/profile/_profile/")({
    component: ProfileIndex,
});
