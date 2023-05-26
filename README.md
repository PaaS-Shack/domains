[![Moleculer](https://badgen.net/badge/Powered%20by/Moleculer/0e83cd)](https://moleculer.services)


# domains.service.js

## Description
Addons service

## Dependencies
- accounts (version 1)

## Service Settings
- `rest`: Enables RESTful API endpoints.
- `fields`: Defines the schema fields for the service.
  - `id`: (string) The ID of the domain.
  - `default`: (boolean) Indicates if the domain is the default.
  - `domain`: (string) The domain name.
  - `name`: (string) The name of the domain.
  - `tld`: (string) The top-level domain of the domain.
  - `sld`: (string) The second-level domain of the domain.
  - `description`: (string) The description of the domain.
  - `recordCount`: (number) The number of records in the domain.
  - `records`: (array) An array of records associated with the domain.
  - `options`: (object) Additional options for the domain.
  - `createdAt`: (number) The timestamp of when the domain was created.
  - `updatedAt`: (number) The timestamp of when the domain was last updated.
  - `deletedAt`: (number) The timestamp of when the domain was deleted.
- `defaultPopulates`: Default populated fields.
- `scopes`: Additional query scopes.
- `defaultScopes`: Default query scopes.
- `config`: Configuration settings for the service.

## Actions
- `create`: Creates a new domain.
- `list`: Retrieves a list of domains.
- `find`: Finds domains based on specific criteria.
- `count`: Counts the number of domains.
- `get`: Retrieves a domain by ID.
- `resolve`: Resolves a domain by ID.
- `update`: Updates a domain.
- `replace`: (disabled)
- `remove`: Removes a domain.
- `domainExists`: Checks if a domain exists.
- `getDomain`: Retrieves a domain based on various parameters.
- `resolveDomain`: Resolves a domain by its name.
- `records`: Retrieves the records associated with a domain.
- `resolveRecord`: Resolves a specific record within a domain.
- `addRecord`: Adds a new record to a domain.
- `removeRecord`: Removes a record from a domain.
- `sync`: Synchronizes domain information with agents.
- `maps`: Retrieves domain mapping information from agents.
- `stats`: Retrieves domain statistics from agents.

## Events
None

## Methods
- `scrapeAgents`: Scrapes agents for information.
- `validateDomain`: Validates the domain name.
- `validateOwner`: Validates the owner of the domain.
- `seedDB`: Seeds the database with initial configuration.

## Service Lifecycle
- `created`: Lifecycle event handler for when the service is created.
- `started`: Lifecycle event handler for when the service is started.
- `stopped`: Lifecycle event handler for when the service is stopped.

# domains.records Service

Attachments of addons service

## Service Configuration

- Name: domains.records
- Version: 1

## Dependencies

- domains (Version 1)

## Service Settings

- REST Endpoint: /v1/domains/:domain/records

### Fields

- id:
  - Type: string
  - Primary key: true
  - Secure: true
  - Column Name: _id

- domain:
  - Type: string
  - Empty: false
  - Readonly: true
  - Populate:
    - Action: v1.domains.get
    - Params:
      - fields: ["id", "domain"]
  - Validate: validateDomain

- fqdn:
  - Type: string
  - Required: true
  - Immutable: true
  - Lowercase: true
  - Trim: true
  - Empty: false

- type:
  - Type: enum
  - Values: ["A", "AAAA", "CNAME", "SOA", "MX", "NS", "TXT", "CAA", "SRV"]
  - Immutable: true
  - Required: true

- data:
  - Type: string
  - Required: true

- network:
  - Type: string
  - Default: null
  - Trim: true
  - Immutable: true
  - Required: false

- replace:
  - Type: string
  - Required: false

- ttl:
  - Type: number
  - Default: 99
  - Required: false

- priority:
  - Type: number
  - Default: 5
  - Required: false

- weight:
  - Type: number
  - Required: false

- port:
  - Type: number
  - Required: false

- target:
  - Type: string
  - Required: false

- flag:
  - Type: number
  - Default: 0
  - Required: false

- tag:
  - Type: string
  - Required: false

- admin:
  - Type: string
  - Required: false

- serial:
  - Type: number
  - Required: false

- refresh:
  - Type: number
  - Required: false

- retry:
  - Type: number
  - Required: false

- expiration:
  - Type: number
  - Required: false

- minimum:
  - Type: number
  - Required: false

- nullified:
  - Type: boolean
  - Default: false
  - Required: false

- poison:
  - Type: boolean
  - Default: false
  - Required: false

- options:
  - Type: object

- createdAt:
  - Type: number
  - Readonly: true

- updatedAt:
  - Type: number
  - Readonly: true

- deletedAt:
  - Type: number
  - Readonly: true
  - Hidden: byDefault

### Scopes

- domain(query, ctx, params): Validates domain permissions
- notDeleted: Filters out deleted records

### Default Scopes

- domain
- notDeleted

## Actions

### create

- Permissions: domains.records.create

### list

- Permissions: domains.records.list
- Params:
  - domain (Type: string)

### find

- REST Endpoint: GET /find
- Permissions: domains.records.find
- Params:
  - domain (Type: string)

### count

- REST Endpoint: GET /count
- Permissions: domains.records.count
- Params:
  - domain (Type: string)

### get

- Need Entity: true
- Permissions: domains.records.get

### update

- Need Entity: true
- Permissions: domains.records.update

### replace

- Enabled: false

### remove

- Need Entity: true
- Permissions: domains.records.remove

### syncRecords

- Params: None
- Handler: Asynchronously finds all entities

### resolveRecord

- Params:
  - fqdn (Type: string, Optional: true)
  - type (Type: string, Optional: true)
  - data (Type: string, Optional: true)
- Handler: Asynchronously finds a single entity based on query parameters

## Events

- "domains.created": Populates domain records when a domain is created
- "domains.removed": Deletes records of a domain when the domain is removed

## Methods

- populateDomainRecords(ctx, domain): Populates domain records based on configuration settings
- validateHasDomainPermissions(query, ctx, params): Validates domain permissions
- validateDomain({ ctx, value, params, id, entity }): Validates the domain value

## Service Lifecycle

- Created: Service created lifecycle event
- Started: Service started lifecycle event
- Stopped: Service stopped lifecycle event
