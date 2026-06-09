# Shared Contracts

Ce package contient les contrats d'echange communs de l'ecosysteme.

Objectif:

- definir une enveloppe standard
- versionner les payloads
- centraliser les schemas Zod reutilisables
- eviter que chaque application redefine ses propres formats

Consommateurs cibles:

- KCS Orbit API
- SAVANEX
- EduPay Smart System
- EduSync AI

Premiers contrats exposes:

- enveloppe commune `IntegrationEnvelopeSchema`
- `StudentUpsertSchema`
- `ClassUpsertSchema`
- `PaymentCreatedSchema`
- `AnnouncementPublishedSchema`