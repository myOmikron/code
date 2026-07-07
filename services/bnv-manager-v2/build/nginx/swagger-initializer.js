window.onload = function () {
    //<editor-fold desc="Changeable Configuration Block">

    // the following lines will be replaced by docker/configurator, when it runs in a docker-container
    window.ui = SwaggerUIBundle({
        urls: [
            {
                name: "Superadmins API", url: "/api/v1/frontend/admin.json"
            },
            {
                name: "Club Admin API", url: "/api/v1/frontend/club-admin.json"
            },
            {
                name: "Club Member API", url: "/api/v1/frontend/club-member.json"
            },
            {
                name: "Common API", url: "/api/v1/frontend/common.json"
            },
            {
                name: "Auth API", url: "/api/v1/frontend/auth.json"
            },
        ],
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: "StandaloneLayout",
    });

    //</editor-fold>
};
