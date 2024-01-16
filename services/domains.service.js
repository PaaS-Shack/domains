"use strict";

const DbService = require("db-mixin");
const ConfigLoader = require("config-mixin");

const Membership = require("membership-mixin");

const psl = require('../lib/psl.min.js')

/**
 * Domains service
 */
module.exports = {
    name: "domains",
    version: 1,

    mixins: [
        DbService({
            entityChangedEventMode: 'emit',
            permissions: 'domains'
        }),
        ConfigLoader(['domains.**']),
        Membership({
            permissions: 'domains'
        })
    ],

    /**
     * Service dependencies
     */
    dependencies: [
        { name: "accounts", version: 1 }
    ],

    /**
     * Service settings
     */
    settings: {
        rest: true,

        fields: {
            default: {
                type: "boolean",
                default: false
            },
            domain: {
                type: "string",
                required: true,
                trim: true,
                empty: false,
                onCreate: ({ ctx, value }) => psl.parse(value.replace('*.', '').replace('_', '')).domain,
                validate: "validateDomain",
            },

            name: {
                type: "string"
            },

            tld: {
                type: "string",
                readonly: true,
                onCreate: ({ ctx, params, value }) => psl.parse(params.domain.replace('*.', '').replace('_', '')).tld
            },
            sld: {
                type: "string",
                readonly: true,
                onCreate: ({ ctx, params, value }) => psl.parse(params.domain.replace('*.', '').replace('_', '')).sld
            },


            description: {
                type: "string",
                required: false,
                trim: true,
            },

            recordCount: {
                type: "number",
                virtual: true,
                populate: function (ctx, values, entities, field) {
                    return Promise.all(
                        entities.map(async entity => {
                            return await ctx.call("v1.domains.records.count", { domain: this.encodeID(entity._id) })
                        })
                    );
                }
            },

            records: {
                type: "array",
                items: { type: "string", empty: false },
                readonly: true,
                populate: {
                    action: "v1.domains.records.list",
                    params: {
                        fields: ["id", "name"]
                    }
                }
            },
            //domain dnssec public private keys


            ...DbService.FIELDS,
            ...Membership.FIELDS,

        },

        defaultPopulates: [
            "records",
        ],

        scopes: {
            ...DbService.SCOPE,
            ...Membership.SCOPE,
        },

        defaultScopes: [
            ...DbService.DSCOPE,
            ...Membership.DSCOPE
        ],

        config: {
            "domains.domain": "example.com",
            "domains.hostmaster": "hostmaster@example.com",
            "domains.issuewild": "letsencrypt.org",
            "domains.autoPopulate": false
        }
    },

    /**
     * Actions
     */
    actions: {

        //service action to create dnssec key pair
        createKeyPair: {
            params: {
                domain: { type: "string", optional: false },
                keyType: {
                    type: "enum",
                    values: ["KSK", "ZSK"],
                    optional: false
                },
                keySize: {
                    type: "enum",
                    values: [1024, 2048, 4096],
                    optional: false
                },
                keyTTL: { type: "number", optional: false },
                keyFlags: {
                    type: "number",
                    default: 257,
                    optional: false
                },
                keyProtocol: {
                    type: "number",
                    default: 3,
                    optional: false
                },
                keyAlgorithm: {
                    type: "enum",
                    values: [
                        "RSAMD5",
                        "DH",
                        "DSA",
                        "ECC",
                        "RSASHA1",
                        "DSANSEC3SHA1",
                        "RSASHA1NSEC3SHA1",
                        "RSASHA256",
                        "RSASHA512",
                        "ECCGOST",
                        "ECDSAP256SHA256",
                        "ECDSAP384SHA384",

                    ],
                    optional: false
                },
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                const parsed = psl.parse(params.domain.replace('*.', '').replace('_', ''));

                const domain = await this.findEntity(ctx, {
                    query: {
                        domain: parsed.domain
                    }
                });

                return await ctx.call('v1.dnssec.createKeyPair', {
                    domain: domain.id,
                    keyType: params.keyType,
                    keySize: params.keySize,
                    keyTTL: params.keyTTL,
                    keyFlags: params.keyFlags,
                    keyProtocol: params.keyProtocol,
                    keyAlgorithm: params.keyAlgorithm,
                })
            }
        },

        domainExists: {
            params: {
                fqdn: "string"
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                const parsed = psl.parse(params.fqdn.replace('*.', '').replace('_', ''));

                const domain = await this.findEntity(ctx, {
                    query: {
                        domain: parsed.domain
                    }
                });
                return !!domain
            }
        },
        getDomain: {
            params: {
                owner: { type: "string", optional: true },
                member: { type: "string", optional: true },
                fqdn: { type: "string", optional: true },
                id: { type: "string", optional: true }
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                const query = {}


                if (params.fqdn) {
                    const parsed = psl.parse(params.fqdn.replace('*.', '').replace('_', ''));
                    query.domain = parsed.domain;
                }

                if (params.id) {
                    query.id = params.id
                }

                if (params.members) {
                    query.members = params.members
                } else if (params.owner) {
                    query.owner = params.owner
                }
                console.log(query)
                return this.findEntity(ctx, {
                    query: query
                });
            }
        },
        resolveDomain: {
            params: {
                domain: { type: "string", optional: false },
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                const parsed = psl.parse(params.domain.replace('*.', '').replace('_', ''));


                const query = { domain: parsed.domain }

                return this.findEntity(ctx, {
                    query,
                    scope: false
                });
            }
        },

        /**
         * check is domain is available
         * 
         * @actions
         * @param {String} domain - domain name
         * 
         * @returns {Boolean} - true if domain is available
         */
        isAvailable: {
            rest: {
                method: "GET",
                path: "/available/:domain",
            },
            params: {
                domain: { type: "string", optional: false },
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                const parsed = psl.parse(params.domain.replace('*.', '').replace('_', ''));

                const domain = await this.findEntity(null, {
                    query: {
                        domain: parsed.domain
                    }
                });

                return !!domain;
            }
        },

        records: {
            rest: "GET /records",
            params: {

            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);
                const domainName = this.config["domains.domain"];

                const domain = await ctx.call('v1.domains.resolveDomain', {
                    domain: domainName
                })

                return ctx.call('v1.domains.records.list', { pageSize: 100, domain: domain.id })
            }
        },
        resolveRecord: {
            description: "Archive the addon",
            rest: "GET /records/:record",
            params: {
                record: { type: "string", optional: false },
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);
                const domainName = this.config["domains.domain"];

                const domain = await ctx.call('v1.domains.resolveDomain', {
                    domain: domainName
                })

                return ctx.call('v1.domains.records.resolve', { id: params.record, domain: domain.id })
            }
        },
        addRecord: {
            params: {
                fqdn: { type: "string", optional: false },
                data: { type: "string", optional: false },
                type: {
                    type: "enum",
                    values: ["A", "AAAA", "CNAME", "NS", "TXT"],
                    optional: true,
                    default: 'A'
                },
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                const parsed = psl.parse(params.fqdn.replace('*.', '').replace('_', ''));

                const domain = await this.findEntity(null, {
                    query: {
                        domain: parsed.domain,
                        deletedAt: null
                    },
                    scope: false
                });

                const options = { meta: { userID: domain.owner } };

                const data = {
                    fqdn: params.fqdn,
                    type: params.type,
                    data: params.data
                }

                let record = await ctx.call(`v1.domains.records.find`, {
                    query: {
                        ...data,
                    },
                    domain: domain.id
                }, options).then((res) => res.shift());
                if (!record) {
                    record = await ctx.call(`v1.domains.records.create`, {
                        ...data,
                        domain: domain.id
                    }, options)
                }

                return record
            }
        },
        removeRecord: {
            params: {
                fqdn: { type: "string", optional: false },
                data: { type: "string", optional: false },
                type: {
                    type: "enum",
                    values: ["A", "AAAA", "CNAME", "NS", "TXT"],
                    optional: true,
                    default: 'A'
                },
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                const parsed = psl.parse(params.fqdn.replace('*.', '').replace('_', ''));

                const domain = await this.findEntity(null, {
                    query: {
                        domain: parsed.domain,
                        deletedAt: null
                    },
                    scope: false
                });

                const options = { meta: { userID: domain.owner } };

                const data = {
                    fqdn: params.fqdn,
                    type: params.type,
                    data: params.data
                }
                let record = await ctx.call(`v1.domains.records.find`, {
                    query: {
                        ...data
                    },
                    domain: domain.id
                }, options).then((res) => res.shift());
                if (record) {
                    await ctx.call(`v1.domains.records.remove`, {
                        id: record.id,
                        domain: domain.id
                    }, options)
                }

                return record
            }
        },
        sync: {
            rest: "GET /sync",
            params: {
                target: { type: "string", min: 3, optional: true },
            },
            async handler(ctx) {
                return this.scrapeAgents(ctx, 'v1.ddns.agent.sync').then((res) => res.filter((item) => item.status == 'fulfilled'))
            }
        },
        maps: {
            rest: "GET /maps",
            params: {
                target: { type: "string", min: 3, optional: true },
            },
            async handler(ctx) {
                return this.scrapeAgents(ctx, 'v1.ddns.agent.maps').then((res) => res.filter((item) => item.status == 'fulfilled'))
            }
        },
        stats: {
            rest: "GET /stats",
            params: {
                target: { type: "string", min: 3, optional: true },
            },
            async handler(ctx) {
                return this.scrapeAgents(ctx, 'v1.ddns.agent.stats').then((res) => res.filter((item) => item.status == 'fulfilled'))
            }
        },
    },

    /**
     * Events
     */
    events: {

    },

    /**
     * Methods
     */
    methods: {
        async scrapeAgents(ctx, action, params = {}) {
            const list = await ctx.call("$node.list");

            const result = [];
            const promises = [];
            for (let index = 0; index < list.length; index++) {
                const node = list[index];
                promises.push(ctx.call(action, params, { nodeID: node.id }));
            }

            const settled = await Promise.allSettled(promises);
            for (let index = 0; index < list.length; index++) {
                const node = list[index];
                result.push({
                    nodeID: node.id,
                    status: settled[index].status,
                    info: settled[index].value,
                    reason: settled[index].reason,
                });
            }

            return result
        },
        validateDomain({ ctx, params, value }) {
            return this.countEntities(ctx, {
                query: {
                    domain: value
                },
            }, { transform: false })
                .then(res =>
                    res == 0
                        ? true
                        : `Domain '${value}' already managed.`
                )
        },
        /**
         * Validate the `owner` property of addon.
         */
        validateOwner({ ctx, value }) {
            return ctx
                .call("v1.accounts.resolve", {
                    id: value,
                    throwIfNotExist: true,
                    fields: ["status"]
                })
                .then(res =>
                    res && res.status == 1
                        ? true
                        : `The owner '${value}' is not an active user.`
                )
            //.catch(err => err.message);
        },
        async seedDB() {
            for (const [key, value] of Object.entries(this.settings.config || {})) {
                const found = await this.broker.call('v1.config.get', { key });
                if (found == null) {
                    await this.broker.call('v1.config.set', { key, value });
                }
            }
        }
    },

    /**
     * Service created lifecycle event handler
     */
    created() { },

    /**
     * Service started lifecycle event handler
     */
    started() { },

    /**
     * Service stopped lifecycle event handler
     */
    stopped() { }
};