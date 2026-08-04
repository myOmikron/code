import React from "react";
import { Avatar } from "src/components/base/avatar";
import { Button } from "src/components/base/button";

/**
 * The properties for {@link UserInfo}
 */
export type UserInfoProps = {
    /** The full name of the user */
    displayName: string;
    /** The mail address of the user */
    mail: string;
    /** The link to the Avatar */
    avatar?: string;
    /** The link to the Avatar Thumbnail */
    avatarThumbnail?: string;
};

/**
 * Minimal information about the user
 */
export default function UserInfo(props: UserInfoProps) {
    const { displayName, mail, avatarThumbnail } = props;

    // TODO: Link to user page

    return (
        <Button className={"flex items-center !gap-6 text-left"} plain={true}>
            <Avatar
                className={"size-8"}
                square={true}
                alt={"avatar"}
                src={avatarThumbnail}
                initials={displayName
                    .split(" ")
                    .map((x) => x[0])
                    .join("")}
            />
            <div className={"flex flex-col"}>
                <span>{displayName}</span>
                <span className={"text-xs text-zinc-700 dark:text-zinc-400"}>{mail}</span>
            </div>
        </Button>
    );
}
