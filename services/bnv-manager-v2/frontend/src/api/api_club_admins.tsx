import {
    Configuration,
    CreateMemberInviteRequest,
    DefaultApi,
    GetClubMembersRequest,
} from "src/api/generated/club-admin";
import { UUID } from "src/api/api";
import { RequiredError, ResponseError } from "src/api/generated/club-admin";
import { parseError } from "src/api/error";

const clubAdminApi = new DefaultApi(new Configuration({ basePath: window.location.origin }));

export const ClubAdminApi = {
    club: {
        get: (club_uuid: UUID) => handleError(clubAdminApi.getClub({ club_uuid })),
        getMembers: (req: GetClubMembersRequest) => handleError(clubAdminApi.getClubMembers(req)),
        getInvitedMembers: (club_uuid: UUID) => handleError(clubAdminApi.getClubMemberInvites({ club_uuid })),
        deleteMember: (club_uuid: UUID, member_uuid: UUID) =>
            handleError(clubAdminApi.deleteMember({ member_uuid, club_uuid })),
        resetCredentials: (club_uuid: UUID, member_uuid: UUID) =>
            handleError(clubAdminApi.resetCredentials({ club_uuid, uuid: member_uuid })),
        getDashboardStats: (club_uuid: UUID) => handleError(clubAdminApi.getDashboardStats({ club_uuid })),
    },
    invites: {
        create: (club_uuid: UUID, req: CreateMemberInviteRequest) =>
            handleError(clubAdminApi.createMemberInvite({ club_uuid, CreateMemberInviteRequest: req })),
        retract: (uuid: UUID, club_uuid: UUID) =>
            handleError(clubAdminApi.retractInvite({ uuid, club_uuid: club_uuid })),
    },
};

/**
 * Wraps a promise returned by the generated SDK which handles its errors and returns a {@link Result}
 *
 * @param promise The promise to wrap. This should be a promise defined in the generated part of the API
 *
 * @returns a new promise with a result that wraps errors from the API
 */
export async function handleError<T>(promise: Promise<T>): Promise<T> {
    try {
        return await promise;
    } catch (e) {
        let msg;
        if (e instanceof ResponseError) {
            await parseError(e.response);
        } else if (e instanceof RequiredError) {
            console.error(e);
            msg = "The server's response didn't match the spec";
        } else {
            console.error("Unknown error occurred:", e);
            msg = "Unknown error occurred";
        }
        throw msg;
    }
}
