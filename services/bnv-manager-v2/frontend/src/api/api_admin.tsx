import {
    Configuration,
    CreateClubRequest,
    CreateInviteRequestAdmin,
    CreateOidcProvider,
    DefaultApi,
    GetClubAdminsRequest,
    GetClubMembersRequest,
} from "src/api/generated/admin";
import { UUID } from "src/api/api";
import { RequiredError, ResponseError } from "src/api/generated/admin";
import { parseError } from "src/api/error";

const adminApi = new DefaultApi(new Configuration({ basePath: window.location.origin }));

export const AdminApi = {
    superadmins: {
        getAll: () => handleError(adminApi.getAllSuperadmins()),
    },
    clubAdmins: {
        delete: (uuid: UUID) => handleError(adminApi.deleteClubAdmin({ uuid })),
    },
    accounts: {
        resetCredentials: (uuid: UUID) => handleError(adminApi.resetCredentials({ uuid })),
    },
    clubs: {
        getAll: () => handleError(adminApi.getClubs()),
        get: (uuid: UUID) => handleError(adminApi.getClub({ uuid })),
        clubMembers: (req: GetClubMembersRequest) => handleError(adminApi.getClubMembers(req)),
        clubAdmins: (req: GetClubAdminsRequest) => handleError(adminApi.getClubAdmins(req)),
        invitedClubMembers: (uuid: UUID) => handleError(adminApi.getClubMemberInvites({ uuid })),
        invitedClubAdmins: (uuid: UUID) => handleError(adminApi.getClubAdminInvites({ uuid })),
        create: (createClub: CreateClubRequest) => handleError(adminApi.createClub({ CreateClubRequest: createClub })),
        delete: (uuid: UUID) => handleError(adminApi.deleteClub({ uuid })),
        getDashboardStats: (uuid: UUID) => handleError(adminApi.getDashboardStats({ uuid })),
        associatedDomains: (uuid: UUID) => handleError(adminApi.getClubDomains({ uuid })),
        associateDomain: (club: UUID, domain: UUID) =>
            handleError(adminApi.associateDomain({ uuid: club, AssociateDomainRequest: { domain } })),
        unassociateDomain: (club: UUID, domain: UUID) =>
            handleError(adminApi.unassociateDomain({ uuid: club, UnassociateDomainRequest: { domain } })),
    },
    domains: {
        unassociated: () => handleError(adminApi.getUnassociatedDomains()),
    },
    invites: {
        create: (invite: CreateInviteRequestAdmin) =>
            handleError(adminApi.createInvite({ CreateInviteRequestAdmin: invite })),
        retract: (invite_uuid: UUID) => handleError(adminApi.retractInvite({ uuid: invite_uuid })),
    },
    oidcProvider: {
        create: (req: CreateOidcProvider) => handleError(adminApi.createOidcProvider({ CreateOidcProvider: req })),
        all: () => handleError(adminApi.getAllOidcProviders()),
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
