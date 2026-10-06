# PathPay — Transaction & Payment Platform Backend Challenge

## Objective

Build a production-oriented backend platform for a fictional fintech/payment company.

The platform allows users to create wallets, add money, transfer money to other users, pay merchants, and receive transaction notifications.

The system must remain **correct under concurrency, retries, failures, duplicate requests, and partial service outages**.

The goal is not to build a beautiful frontend.

The goal is to demonstrate that you can design and implement a backend system involving:

* REST APIs
* PostgreSQL and SQL
* database transactions
* concurrency control
* Redis
* asynchronous messaging
* microservices
* idempotency
* distributed-systems failure handling
* Docker
* Kubernetes
* observability
* testing
* performance debugging
* production-style architecture

The final system should be something you could confidently discuss in a Pathao backend interview.

---

# 1. Business Scenario

You are working for **PathPay**, a digital payment platform.

Users can:

1. Create an account
2. Create a wallet
3. Deposit money
4. Transfer money to another user
5. Pay a merchant
6. View transaction history
7. Receive transaction notifications

Merchants can:

1. Register
2. Create payment requests
3. Receive payment confirmation
4. Query transaction status

The platform processes thousands of transactions concurrently.

The biggest requirement is:

> **The system must never lose money or create money because of race conditions, retries, crashes, or duplicate requests.**

---

# 2. Core Functional Requirements

## Users

Implement:

```text
POST   /users
GET    /users/:id
```

A user should have at least:

```text
id
name
email
phone
created_at
```

Email and phone must be unique.

---

# 3. Wallets

Each user has one wallet.

Implement:

```text
POST /wallets
GET  /wallets/:userId
GET  /wallets/:userId/balance
```

Wallet:

```text
id
user_id
balance
currency
status
created_at
updated_at
```

You must guarantee that balance never becomes negative.

---

# 4. Money Deposit

Implement:

```text
POST /wallets/:id/deposit
```

Example:

```json
{
  "amount": 1000,
  "currency": "BDT"
}
```

A deposit must:

1. Validate amount
2. Create a transaction record
3. Increase wallet balance
4. Commit everything atomically

A failure halfway through must not leave the system in an inconsistent state.

---

# 5. Wallet-to-Wallet Transfer

Implement:

```text
POST /transfers
```

Example:

```json
{
  "from_wallet": "wallet-a",
  "to_wallet": "wallet-b",
  "amount": 500
}
```

Requirements:

* Sender must have sufficient balance
* Sender balance decreases
* Receiver balance increases
* Transaction record is created
* All changes happen atomically
* A failed transfer must rollback
* Negative amounts are invalid
* Sender and receiver cannot be the same wallet

---

# 6. Transaction Ledger

Do not rely only on wallet balance.

Create a proper transaction/ledger model.

Every financial operation must produce an immutable transaction record.

Example:

```text
transaction_id
type
source_wallet
destination_wallet
amount
currency
status
idempotency_key
created_at
completed_at
metadata
```

Possible transaction types:

```text
DEPOSIT
TRANSFER
MERCHANT_PAYMENT
REFUND
```

Possible states:

```text
PENDING
PROCESSING
SUCCESS
FAILED
REFUNDED
```

The transaction history API should support:

```text
GET /transactions
```

with:

```text
user_id
status
type
date range
pagination
```

---

# 7. Merchant Payments

A merchant can create a payment request.

```text
POST /payments
```

Example:

```json
{
  "merchant_id": "merchant-123",
  "customer_wallet_id": "wallet-123",
  "amount": 1500
}
```

The payment system must:

1. Validate the merchant
2. Validate the customer
3. Check balance
4. Reserve/process the payment
5. Update the customer's wallet
6. Record the transaction
7. Notify the merchant
8. Return the payment status

---

# 8. The Critical Requirement: Idempotency

Every money-moving API must support:

```http
Idempotency-Key: <unique-key>
```

Example:

```http
POST /payments
Idempotency-Key: 8f3a...
```

Imagine:

```text
Client
  |
  | payment request
  v
Payment Service
  |
  | bank/payment processing succeeds
  |
  X server crashes
```

The client does not receive the response.

The client retries with the same idempotency key.

Your system must **not charge the customer twice**.

Requirements:

* Same idempotency key + same request → return original result
* Same idempotency key + different request → reject
* Concurrent duplicate requests → only one transaction succeeds
* Idempotency data must survive service restarts

---

# 9. Concurrency Challenge

Your application will receive concurrent requests.

Example:

```text
Wallet balance = 1000

Request A:
withdraw 800

Request B:
withdraw 700
```

Both requests arrive at almost exactly the same time.

Your system must guarantee that the wallet does not end up with an invalid balance.

You must design for:

* race conditions
* concurrent updates
* row locking
* transaction isolation
* deadlocks
* atomic operations

You should be able to demonstrate this with an automated concurrency test.

For example:

```text
100 concurrent requests
same wallet
each attempting to withdraw 10
initial balance = 500
```

The final balance must be correct.

---

# 10. PostgreSQL Requirements

PostgreSQL must be the **source of truth** for financial state.

You must use PostgreSQL rather than MongoDB for the core transaction system.

You are required to demonstrate:

### SQL

Use:

```text
JOIN
GROUP BY
HAVING
CTE
subqueries
window functions
aggregations
pagination
```

where appropriate.

### Constraints

Use:

```text
PRIMARY KEY
FOREIGN KEY
UNIQUE
CHECK
NOT NULL
```

where appropriate.

### Indexes

Create appropriate indexes for:

```text
user lookup
wallet lookup
transaction lookup
transaction history
idempotency lookup
merchant lookup
```

You must be able to explain:

> Why does each index exist?

---

# 11. Query Performance Investigation

Create at least one intentionally slow query.

Then investigate it using:

```sql
EXPLAIN ANALYZE
```

Document:

```text
Before
↓
Query execution plan
↓
Problem
↓
Index/schema/query change
↓
After
```

Your final repository should contain a short performance report.

---

# 12. Redis

Introduce Redis for non-authoritative state.

You must use Redis for at least **two** of these:

```text
rate limiting
caching
short-lived idempotency state
distributed locking
session/token state
```

At least one API must have rate limiting.

Example:

```text
POST /payments
```

could be limited to:

```text
20 requests/minute/user
```

You must explain:

> Why is Redis appropriate here?

and:

> Why shouldn't Redis be the source of truth for account balances?

---

# 13. Messaging

Introduce an asynchronous message broker.

Choose:

```text
Kafka
```

or:

```text
RabbitMQ
```

You should have events such as:

```text
PaymentCreated
PaymentSucceeded
PaymentFailed
TransferCompleted
RefundCreated
```

For example:

```text
Payment Service
      |
      | PaymentSucceeded
      v
Message Broker
      |
      +----> Notification Service
      |
      +----> Analytics Service
      |
      +----> Merchant Webhook Service
```

The payment request should not have to synchronously call every downstream service.

---

# 14. Duplicate Message Handling

Assume the broker provides **at-least-once delivery**.

Therefore:

```text
message received
      ↓
database update succeeds
      ↓
consumer crashes
      ↓
message delivered again
```

Your consumer must not perform the business operation twice.

Implement an idempotent consumer.

Demonstrate this with a test.

---

# 15. Notification Service

Create a separate service.

Responsibilities:

```text
consume payment events
consume transfer events
send notification
```

For now, notification can simply be simulated using logs or a mock email provider.

Example:

```text
Payment ৳500 successful
Transaction ID: tx_123
```

The important part is asynchronous communication.

---

# 16. Merchant Webhook Service

When a payment succeeds, notify the merchant.

Implement:

```text
POST /webhooks/payment
```

from the perspective of the internal system.

The webhook service should handle:

```text
timeouts
5xx responses
retries
duplicate delivery
exponential backoff
```

The merchant endpoint may randomly fail.

Your system must behave correctly.

---

# 17. Outbox Requirement

You are not allowed to simply do:

```text
UPDATE database
publish Kafka message
```

without considering failure between those two operations.

Design an approach that prevents:

```text
DB transaction succeeds
        ↓
service crashes
        ↓
event never published
```

Implement the **transactional outbox pattern**.

For example:

```text
Database Transaction
       |
       +---- update wallet
       |
       +---- create transaction
       |
       +---- insert outbox event
       |
       COMMIT
```

Then a worker publishes events from the outbox.

---

# 18. Microservice Architecture

You should have at least:

```text
API Gateway
User Service
Wallet Service
Payment Service
Notification Service
```

You may combine services initially and separate them later.

The important part is that you understand:

```text
service boundaries
API contracts
database ownership
communication
failure boundaries
```

A service should not randomly access another service's database.

---

# 19. Authentication

Implement authentication using JWT.

At minimum:

```text
register
login
authenticated endpoints
role-based access
```

Roles:

```text
USER
MERCHANT
ADMIN
```

Users must not be able to access another user's private financial information.

---

# 20. API Design

Your API should follow consistent conventions.

For example:

```text
POST   /users
POST   /auth/login

GET    /wallets/:id
POST   /wallets/:id/deposit

POST   /transfers
GET    /transactions

POST   /payments
GET    /payments/:id

GET    /merchants/:id
```

Use appropriate HTTP status codes.

You must distinguish between:

```text
400
401
403
404
409
422
429
500
503
```

where appropriate.

---

# 21. Error Handling

Every service must have consistent error responses.

Example:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Wallet does not have sufficient balance"
  },
  "request_id": "req_123"
}
```

Do not expose internal errors or stack traces to clients.

---

# 22. Observability

Every request should have a request ID.

Logs should contain information such as:

```text
request_id
user_id
service
endpoint
status
latency
transaction_id
```

Implement metrics for at least:

```text
request count
request latency
error count
payment success/failure count
database query latency
queue depth
```

Add health endpoints:

```text
GET /health
GET /ready
```

---

# 23. Production Failure Scenarios

Your system must be tested against these scenarios.

### Scenario 1

Database temporarily unavailable.

What happens?

### Scenario 2

Redis unavailable.

What functionality should still work?

### Scenario 3

Message broker unavailable.

What happens to completed payments?

### Scenario 4

Notification service is down.

Can payments still complete?

### Scenario 5

Client sends the same payment request 10 times.

How many payments occur?

### Scenario 6

Payment succeeds but the API server crashes before response.

What does the retry do?

### Scenario 7

Two concurrent withdrawals exceed the available balance.

What happens?

### Scenario 8

Consumer processes the same event twice.

What happens?

### Scenario 9

Merchant webhook returns HTTP 500.

What happens?

### Scenario 10

One service becomes extremely slow.

How do you prevent the entire platform from becoming unavailable?

---

# 24. Testing Requirements

Write tests at multiple levels.

## Unit tests

Test:

```text
balance validation
payment state transitions
idempotency logic
authorization
business rules
```

## Integration tests

Test:

```text
API + PostgreSQL
API + Redis
API + message broker
```

## Concurrency tests

Test:

```text
100 concurrent withdrawals
100 duplicate payment requests
concurrent transfers
```

## Failure tests

Test:

```text
database failure
broker failure
Redis failure
downstream timeout
duplicate events
```

You should be able to run:

```bash
make test
```

and execute the full suite.

---

# 25. Docker

Everything must be containerized.

At minimum:

```text
API Gateway
User Service
Wallet Service
Payment Service
Notification Service
PostgreSQL
Redis
Kafka/RabbitMQ
```

Provide:

```text
Dockerfiles
docker-compose.yml
.env.example
Makefile
```

A new developer should be able to run:

```bash
git clone ...
cp .env.example .env
docker compose up
```

and start the entire system.

---

# 26. Kubernetes

Deploy the system to Kubernetes.

Create:

```text
Deployment
Service
ConfigMap
Secret
Ingress
```

You should also demonstrate:

```text
livenessProbe
readinessProbe
resource requests
resource limits
horizontal scaling
```

At minimum:

```text
payment-service
wallet-service
notification-service
```

should run as Kubernetes deployments.

---

# 27. CI/CD

Create a GitHub Actions pipeline.

Pipeline:

```text
push
 ↓
lint
 ↓
unit tests
 ↓
integration tests
 ↓
build Docker images
 ↓
security/basic validation
 ↓
deploy
```

You already have GitHub Actions and ArgoCD experience, so this should be one of the easier sections for you.

---

# 28. Performance Requirement

Create a load-test scenario.

For example:

```text
100 concurrent users
500 requests/sec target
```

Measure:

```text
RPS
p50 latency
p95 latency
p99 latency
error rate
database utilization
CPU
memory
```

Find at least one bottleneck.

Optimize it.

Document:

```text
Problem
↓
Measurement
↓
Root cause
↓
Optimization
↓
Measurement after optimization
```

---

# 29. Required Architecture Documentation

Create:

```text
README.md
ARCHITECTURE.md
DATABASE.md
API.md
FAILURE_SCENARIOS.md
PERFORMANCE.md
```

Your architecture document should include:

```text
system architecture diagram
service responsibilities
database ownership
request flows
event flows
failure handling
scaling strategy
```

---

# 30. Required Architecture Diagram

Your final architecture should resemble something conceptually like:

```text
                       ┌───────────────┐
                       │    Client     │
                       └───────┬───────┘
                               │
                               ▼
                      ┌─────────────────┐
                      │   API Gateway   │
                      └────────┬────────┘
                               │
                ┌──────────────┼───────────────┐
                │              │               │
                ▼              ▼               ▼
          ┌──────────┐   ┌──────────┐   ┌───────────┐
          │  User    │   │  Wallet  │   │  Payment  │
          │ Service  │   │ Service  │   │  Service  │
          └────┬─────┘   └────┬─────┘   └─────┬─────┘
               │              │                │
               └──────────────┼────────────────┘
                              │
                       ┌──────▼──────┐
                       │ PostgreSQL  │
                       └─────────────┘

                     ┌─────────────┐
                     │    Redis    │
                     └─────────────┘

                     ┌─────────────┐
                     │ Kafka/RMQ   │
                     └──────┬──────┘
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
          ┌──────────────┐     ┌──────────────┐
          │ Notification │     │   Webhook    │
          │   Service    │     │   Service    │
          └──────────────┘     └──────────────┘
```

Do not blindly copy this architecture.

You should be able to defend every component.

---

# 31. The Most Important Interview Questions This Project Must Prepare You For

After completing the project, you should be able to answer these without preparation:

### PostgreSQL

> Why PostgreSQL instead of MongoDB for financial transactions?

> What isolation level are you using?

> When would you use `SELECT FOR UPDATE`?

> How do you prevent a lost update?

> What causes a deadlock?

> How do you investigate a slow query?

> Why did you create this index?

> What happens when the database connection pool is exhausted?

---

### Transactions

> How do you guarantee atomicity?

> What happens if the process crashes halfway through a transfer?

> How do you prevent duplicate payments?

> What happens when two withdrawals happen simultaneously?

---

### Redis

> Why Redis?

> What happens when Redis goes down?

> Why shouldn't balance live only in Redis?

> How would you implement rate limiting?

> When would a distributed lock be dangerous?

---

### Kafka/RabbitMQ

> Why asynchronous messaging?

> Kafka vs RabbitMQ?

> What is at-least-once delivery?

> How do you handle duplicate events?

> What happens if a consumer crashes after processing but before acknowledgment?

---

### Distributed systems

> The payment provider succeeds but your server times out. What does the client see?

> How do you retry safely?

> How do you guarantee you don't charge twice?

> What happens if one service becomes unavailable?

> Where should timeouts exist?

> Where should retries exist?

> When should you use a circuit breaker?

---

### System design

> Design a payment service handling 10,000 transactions/second.

> How would you scale PostgreSQL?

> How would you partition transaction data?

> How would you make the system highly available?

> What would you monitor?

---

### Go

If you implement the system in Go:

> Why are goroutines useful?

> Goroutine vs OS thread?

> What are channels?

> When would you use a mutex instead?

> What is `context.Context` used for?

> How does Go handle errors?

---

# 32. Recommended Technology Choice For You

Because your current experience is strongly Node.js-based, I would deliberately use:

```text
Backend language: Go
Database: PostgreSQL
Cache: Redis
Broker: Kafka
Container: Docker
Orchestration: Kubernetes
CI/CD: GitHub Actions
```

Why Go?

Because the JD explicitly mentions Go/Java/Python or similar backend technologies, and your resume currently does not demonstrate one of those languages strongly. Your Node.js experience is already useful, so learning the fundamentals of Go while implementing the project gives you a stronger interview story.

Don't attempt to create a massive production-grade framework.

Use a simple Go project structure and spend your time understanding the **backend engineering problems**.

---

# 33. Definition of "Completed"

I would consider this project successfully completed only when you can demonstrate all of these:

```text
[ ] PostgreSQL schema designed
[ ] Proper SQL queries
[ ] Indexes
[ ] EXPLAIN ANALYZE investigation

[ ] ACID transactions
[ ] Concurrent transfer protection
[ ] Deadlock understanding
[ ] Idempotent payment API

[ ] Redis caching/rate limiting
[ ] Message broker
[ ] Event-driven communication
[ ] Duplicate message protection

[ ] Transactional outbox
[ ] Retry strategy
[ ] Timeout strategy
[ ] Failure handling

[ ] Microservice boundaries
[ ] REST API
[ ] JWT authentication
[ ] Authorization

[ ] Unit tests
[ ] Integration tests
[ ] Concurrency tests
[ ] Failure tests

[ ] Docker
[ ] Docker Compose
[ ] Kubernetes
[ ] Health checks
[ ] Resource limits

[ ] CI/CD
[ ] Logs
[ ] Metrics
[ ] Request tracing/correlation IDs

[ ] Load testing
[ ] Performance investigation
[ ] Architecture documentation
```

---

# 34. The Final Interview Test

After completing the project, I would expect you to be able to sit in an interview and answer this question for **45–60 minutes**:

> "Design a digital wallet and payment system that processes millions of transactions per day."

You should naturally discuss:

```text
API design
      ↓
PostgreSQL
      ↓
transactions
      ↓
locking
      ↓
concurrency
      ↓
idempotency
      ↓
Redis
      ↓
Kafka/RabbitMQ
      ↓
outbox pattern
      ↓
retries
      ↓
timeouts
      ↓
failure handling
      ↓
observability
      ↓
Docker
      ↓
Kubernetes
      ↓
scaling
```

And more importantly, you should be able to answer:

> **"What happens when things go wrong?"**

That is where this project becomes significantly more valuable than a normal CRUD project.

---

# 35. Your 5-Day Execution Order

### Day 1

```text
Go fundamentals
PostgreSQL
schema
SQL
transactions
locking
```

### Day 2

```text
Wallet
transfer
concurrency
idempotency
tests
```

### Day 3

```text
Redis
Kafka/RabbitMQ
microservices
outbox
event processing
```

### Day 4

```text
failure handling
retry
timeouts
webhooks
observability
Docker
```

### Day 5

```text
Kubernetes
CI/CD
load testing
performance investigation
architecture documentation
full mock interview
```

Do not waste time building a frontend.

Do not waste time making the APIs aesthetically perfect.

Do not spend half a day configuring Kubernetes.

The core deliverable is:

> **A backend that cannot lose money even when requests are duplicated, executed concurrently, messages are redelivered, services crash, and dependencies temporarily fail.**

That single project gives you a concrete story for almost every major requirement in the Pathao JD while directly addressing the gaps visible in your current resume—especially PostgreSQL/SQL, concurrency, distributed systems, messaging, and transaction-heavy backend design.
