"use strict";

const DbService = require("db-mixin");
const ConfigLoader = require("config-mixin");

const Membership = require("membership-mixin");

const crypto = require('crypto');
const { promisify } = require('util');


const generateKeyPair = promisify(crypto.generateKeyPair);



const ALGORITHMS = [
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
]

//molecularjs service to manage dnssec domains public and private keys.
//domains and record signing 

module.exports = {
    name: "dnssec",
    version: 1,

    mixins: [
        DbService({
            entityChangedEventMode: 'emit'
        }),
    ],

    /**
     * Service dependencies
     */
    dependencies: [
        { name: "domains", version: 1 }
    ],

    settings: {

        rest: "/v1/dnssec/:domain",

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
            //public key
            publicKey: {
                type: "string",
                empty: false,
                secure: true,

            },
            //private key
            privateKey: {
                type: "string",
                empty: false,
                secure: true,
            },
            //key type
            keyType: {
                type: "enum",
                values: ["KSK", "ZSK"],
                empty: false,
                secure: true,
            },
            //key algorithm
            keyAlgorithm: {
                type: "enum",
                values: ALGORITHMS,
                empty: false,
                secure: true,
            },
            //key size
            keySize: {
                type: "enum",
                values: ["1024", "2048", "4096"],
                empty: false,
                secure: true,
            },
            //key flags
            keyFlags: {
                type: "number",
                empty: false,
                secure: true,
            },
            //key protocol
            keyProtocol: {
                type: "enum",
                values: ["3", "4", "5", "15"],
                default: "3",
                empty: false,
                secure: true,
            },

            //key active
            active: {
                type: "boolean",
                default: false,
                empty: false,
                secure: true,
            },

        }
    },

    actions: {
        createKeyPair: {
            params: {
                domain: {
                    type: "string",
                    empty: false,
                },
                keyType: {
                    type: "enum",
                    values: ["KSK", "ZSK"],
                    empty: false,
                },
                keyAlgorithm: {
                    type: "enum",
                    values: ALGORITHMS,
                    empty: false,
                },
                keySize: {
                    type: "enum",
                    values: ["1024", "2048", "4096"],
                    empty: false,
                },
                keyFlags: {
                    type: "number",
                    empty: false,
                },
                keyProtocol: {
                    type: "enum",
                    values: ["3", "4", "5", "15"],
                    default: "3",
                    empty: false,
                },
            },
            async handler(ctx) {

                let keyPair = await this.generateKeyPair(ctx.params);

                //store key pair
                let key = await this.create({
                    domain: ctx.params.domain,
                    publicKey: keyPair.publicKey,
                    privateKey: keyPair.privateKey,
                    keyType: ctx.params.keyType,
                    keyAlgorithm: ctx.params.keyAlgorithm,
                    keySize: ctx.params.keySize,
                    keyFlags: ctx.params.keyFlags,
                    keyProtocol: ctx.params.keyProtocol,
                    active: true,
                })

                //save key to v1.domains.records

                const DNSKEYRecord = await ctx.call("v1.domains.records.create", {
                    domain: ctx.params.domain,
                    type: "DNSKEY",
                    name: ctx.params.domain,
                    data: key.publicKey,
                    keyAlgorithm: key.keyAlgorithm,
                    keyFlags: key.keyFlags,
                    keyProtocol: key.keyProtocol,
                    keySize: key.keySize,
                    ttl: 3600
                });
                // save NSEC3PARAM record to v1.domains.records
                const NSEC3PARAMRecord = await ctx.call("v1.domains.records.create", {
                    domain: ctx.params.domain,
                    type: "NSEC3PARAM",
                    name: ctx.params.domain,
                    data: `1 0 1 ${key.publicKey}`,
                    keyAlgorithm: key.keyAlgorithm,
                    keyFlags: key.keyFlags,
                    iterations: 1,
                    salt: "0",
                    ttl: 3600
                });

                //save DS record to v1.domains.records
                const DSRecord = await ctx.call("v1.domains.records.create", {
                    domain: ctx.params.domain,
                    type: "DS",
                    name: ctx.params.domain,
                    data: `${key.keyTag} ${key.keyAlgorithm} ${key.keyFlags} ${key.publicKey}`,
                    keyTag: record.keyTag,
                    algorithm: key.keyAlgorithm,
                    digestType: key.digestType,
                    digest: key.digest,
                    ttl: 3600
                });

                //return key
                
                return DNSKEYRecord;
            }
        },
        //sign a record
        verify: {
            params: {
                domain: {
                    type: "string",
                    empty: false,

                },
                record: {
                    type: "string",
                    empty: false,
                },

            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);
                //get domain
                const domain = await ctx.call("v1.domains.resolve", { id: params.domain });
                //get record
                const record = await ctx.call("v1.domains.records.resolve", { id: params.record });
                //get key for domain and record type
                const key = await this.findEntity(null, {
                    query: {
                        domain: domain.id,
                        active: true,
                        keyType: "ZSK",
                    },
                    fields: ["id", "domain", "publicKey", "privateKey", "keyType", "keyAlgorithm", "keySize", "keyFlags", "keyProtocol", "active"],
                    scope: false
                });

                //verify record
                const verified = await this.verify(record, key.privateKey, {
                    algorithm: key.keyAlgorithm,
                    flags: key.keyFlags,
                    protocol: key.keyProtocol,
                    keySize: key.keySize,
                    keyTag: key.keyFlags,
                    signer: domain.domain,
                });

                return verified;
            }
        },
        //sign a record
        sign: {
            params: {
                domain: {
                    type: "string",
                    empty: false,

                },
                record: {
                    type: "string",
                    empty: false,
                },

            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);
                //get domain
                const domain = await ctx.call("v1.domains.resolve", { id: params.domain });
                //get record
                const record = await ctx.call("v1.domains.records.resolve", { id: params.record });
                //get key
                const key = await this.findEntity(null, {
                    query: {
                        domain: domain.id,
                        active: true,
                        keyType: "ZSK",
                    },
                    fields: ["id", "domain", "publicKey", "privateKey", "keyType", "keyAlgorithm", "keySize", "keyFlags", "keyProtocol", "active"],
                    scope: false
                });

                //sign record
                const signedRecord = await dnssec.sign(record, key.privateKey, {
                    algorithm: key.keyAlgorithm,
                    flags: key.keyFlags,
                    protocol: key.keyProtocol,
                    keySize: key.keySize,
                    keyTag: key.keyFlags,
                    signer: domain.domain,
                });
                //save signed record to v1.domains.records
                const RRSIGRecord = await ctx.call("v1.domains.records.create", {
                    domain: ctx.params.domain,
                    type: "RRSIG",
                    name: ctx.params.domain,
                    data: signedRecord,
                    ttl: 3600,
                    class: "IN",
                })
                //return signed record


                return signedRecord;
            }
        }
    },

    methods: {
        algorithmNameToNumber(algorithmName) {
            // Convert the algorithm name to a number from array index
            const algorithmNumber = ALGORITHMS.indexOf(algorithmName);

            return algorithmNumber;
        },
        async sign(record, privateKey, options) {
            const recordType = record.type;
            const recordName = record.name;
            const recordData = record.data;
            const recordTTL = record.ttl;
            const recordClass = record.class;

            const recordString = `${recordType} ${recordName} ${recordData} ${recordTTL} ${recordClass}`;

            console.log(recordString);

            // Convert the recordString to a Buffer for signing
            const recordBuffer = Buffer.from(recordString);

            // Create a Sign object using the private key
            const sign = crypto.createSign(options.algorithm);

            // Update the sign object with the data to be signed
            sign.update(recordBuffer);

            // Sign the data and get the signature in binary format
            const signatureBinary = sign.sign(privateKey, 'binary');

            // Convert the binary signature to base64
            const signatureBase64 = Buffer.from(signatureBinary, 'binary').toString('base64');

//key digest
            const keyDigest = crypto.createHash('sha256').update(options.publicKey).digest('hex');
            

            // Construct the signed record
            const signedRecord = `${recordString} ${options.algorithm} ${options.flags} ${options.keyTag} ${signatureBase64}`;

            return signedRecord;



        },
        async verify(record, publicKey, options) {
            const recordType = record.type;
            const recordName = record.name;
            const recordData = record.data;
            const recordTTL = record.ttl;
            const recordClass = record.class;

            const recordString = `${recordType} ${recordName} ${recordData} ${recordTTL} ${recordClass}`;

            console.log(recordString);

            // Convert the recordString to a Buffer for verification
            const recordBuffer = Buffer.from(recordString);

            // Create a Verify object using the public key
            const verify = crypto.createVerify(options.algorithm);

            // Update the verify object with the data to be verified
            verify.update(recordBuffer);

            // Decode the base64 signature
            const signatureBinary = Buffer.from(options.signatureBase64, 'base64');

            // Verify the signature using the public key
            const isVerified = verify.verify(publicKey, signatureBinary);

            return isVerified;
        },
        async generateKeyPair(params) {

            let keyPair = await generateKeyPair(params.keyAlgorithm, {
                modulusLength: params.keySize,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem'
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem',
                }
            });

            return keyPair;
        },
        async validateDomain({ ctx, value, params, id, entity }) {
            return ctx.call("v1.domains.getDomain", { fqdn: params.fqdn, member: ctx.meta.userID })
                .then((res) => res ? true : `No permissions '${value} not found'`)
        },
    }
}

