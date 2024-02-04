"use strict";

const DbService = require("db-mixin");
const ConfigLoader = require("config-mixin");

const { MoleculerClientError } = require("moleculer").Errors;

/**
 * attachments of addons service
 */
module.exports = {
	name: "domains.records",
	version: 1,

	mixins: [
		DbService({
			permissions: 'domains.records'
		}),
		ConfigLoader(['domains.**'])
	],

	/**
	 * Service dependencies
	 */
	dependencies: [
		{ name: "domains", version: 1 }
	],

	/**
	 * Service settings
	 */
	settings: {
		rest: "/v1/domains/:domain/records",

		fields: {

			domain: {
				type: "string",
				empty: false,
				onCreate: ({ ctx, params }) => ctx.call("v1.domains.getDomain", { fqdn: params.fqdn, member: ctx.meta.userID })
					.then((domain) => {
						if (!domain) {
							throw new MoleculerClientError(
								`You have no right for the domain '${params.fqdn}'`,
								403,
								"ERR_NO_PERMISSION",
								{ domain: params.fqdn }
							)
						}
						return domain.id
					}),
				readonly: true,
				populate: {
					action: "v1.domains.get",
					params: {
						fields: ["id", "domain"]
					}
				},
				validate: "validateDomain",
			},

			fqdn: {
				type: "string",
				required: true,
				immutable: true,
				lowercase: true,
				trim: true,
				empty: false,
			},

			type: {
				type: "enum",
				values: [
					"A", "AAAA", "CNAME",
					"SOA", "MX", "NS",
					"TXT", "CAA", "SRV",
					"TLSA", "DS", "DNSKEY",
					"NSEC", "NSEC3", "NSEC3PARAM",
					"RRSIG"
				],
				immutable: true,
				required: true,
			},
			data: {
				type: "string",
				required: true,
			},
			network: {
				type: "string",
				default: null,
				trim: true,
				immutable: true,
				required: false,
			},
			replace: {
				type: "string",
				required: false,
			},

			ttl: {
				type: "number",
				default: 99,
				required: false,
			},
			priority: {
				type: "number",
				default: 5,
				required: false,
			},

			//SRV
			weight: {
				type: "number",
				required: false,
			},
			port: {
				type: "number",
				required: false,
			},
			target: {
				type: "string",
				required: false,
			},

			flag: {
				type: "number",
				default: 0,
				required: false,
			},
			tag: {
				type: "string",
				required: false,
			},

			admin: {
				type: "string",
				required: false,
			},
			serial: {
				type: "number",
				required: false,
			},
			refresh: {
				type: "number",
				required: false,
			},
			retry: {
				type: "number",
				required: false,
			},
			expiration: {
				type: "number",
				required: false,
			},
			minimum: {
				type: "number",
				required: false,
			},
			//dnssec records
			keyType: {
				type: "enum",
				values: ["KSK", "ZSK"],
				required: false
			},
			keySize: {
				type: "enum",
				values: [1024, 2048, 4096],
				required: false
			},
			keyTTL: { type: "number", required: false },
			keyFlags: {
				type: "number",
				default: 257,
				required: false
			},
			keyProtocol: {
				type: "number",
				default: 3,
				required: false
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
				required: false
			},

			nullified: {
				type: "boolean",
				default: false,
				required: false,
			},
			poison: {
				type: "boolean",
				default: false,
				required: false,
			},

			...DbService.FIELDS,
		},

		defaultPopulates: [

		],

		scopes: {
			async domain(query, ctx, params) { return this.validateHasDomainPermissions(query, ctx, params) },
			...DbService.SCOPE,
		},

		defaultScopes: [
			"domain",
			...DbService.DSCOPE,
		],
	},

	/**
	 * Actions
	 */

	actions: {
		syncRecords: {
			params: {},
			async handler(ctx) {
				return this.findEntities(ctx, {});
			}
		},
		resolveRecord: {
			params: {
				fqdn: { type: "string", optional: true },
				type: { type: "string", optional: true },
				data: { type: "string", optional: true },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);
				return this.findEntity(null, {
					query: {
						...params
					}
				});
			}
		},

		/**
		 * remove records by domain
		 * 
		 * @actions
		 * @param {String} domain - domain id
		 * 
		 * @returns {Number} - number of removed records
		 */
		removeByDomain: {
			params: {
				domain: { type: "string" }
			},
			async handler(ctx) {
				const domain = ctx.params.domain;
				const entities = await this.findEntities(null, {
					query: { domain },
					fields: ["id"],
					scope: false
				});
				await this.Promise.all(
					entities.map(entity =>
						this.removeEntity(ctx, { id: entity.id, scope: false })
							.catch((err) => {
								this.logger.error(`Error removing domain record ${entity.id}`, err)
							})
					)
				);
				return entities.length;
			}
		},
	},

	/**
	 * Events
	 */
	events: {
		async "domains.created"(ctx) {
			const domain = ctx.params.data;
			return this.populateDomainRecords(ctx, domain)
		},
		async "domains.removed"(ctx) {
			const domain = ctx.params.data;

			const entities = await this.actions.removeByDomain({ domain: domain.id });

			this.logger.info(`Removed ${entities} records for domain ${domain.domain}`)

		},
	},

	/**
	 * Methods
	 */
	methods: {
		async populateDomainRecords(ctx, domain) {

			const promises = [];

			if (this.config["domains.autoPopulate"]) {
				const soa = {
					fqdn: domain.domain,
					type: "SOA",
					ttl: 3600,
					admin: this.config["domains.hostmaster"],
					serial: 2003080800,
					refresh: 86400,
					retry: 900,
					expiration: 1209600,
					minimum: 86400
				};

				soa.data = this.config["domains.domain"];

				promises.push(this.actions.create(soa, { parentCtx: ctx }));

				if (this.config["domains.issuewild"]) {
					promises.push(this.actions.create({
						fqdn: domain.domain,
						type: "CAA",
						flag: 0,
						tag: 'issuewild',
						data: this.config["domains.issuewild"]
					}, { parentCtx: ctx }));
				}

				const mainDomain = await ctx.call('v1.domains.getDomain', {
					domain: this.config['domains.domain']
				});

				if (mainDomain) {
					const nameservers = await this.findEntities(null, {
						query: {
							domain: mainDomain.id,
							type: 'NS'
						}
					});

					for (let index = 0; index < nameservers.length; index++) {
						const nameserver = nameservers[index];
						promises.push(this.actions.create({
							fqdn: `${domain.domain}`,
							type: "NS",
							data: nameserver.data,
						}, { parentCtx: ctx }));
					}

					// mx records
					const mx = await this.findEntities(null, {
						query: {
							domain: mainDomain.id,
							type: 'MX'
						}
					});

					for (let index = 0; index < mx.length; index++) {
						const record = mx[index];
						promises.push(this.actions.create({
							fqdn: `${domain.domain}`,
							type: "MX",
							data: record.data,
							priority: record.priority,
						}, { parentCtx: ctx }));
					}
				}
			}
			return Promise.all(promises)
		},
		async validateHasDomainPermissions(query, ctx, params) {
			// Adapter init
			if (!ctx) return query;

			if (params.domain) {
				query.domain = params.domain
			}

			return query;
		},

		async validateDomain({ ctx, value, params, id, entity }) {
			return ctx.call("v1.domains.getDomain", { fqdn: params.fqdn, member: ctx.meta.userID })
				.then((res) => res ? true : `No permissions '${value} not found'`)
		},
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