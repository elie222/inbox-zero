# Google Pub/Sub Architecture & Flow Diagrams

Visual representations of how Google Pub/Sub and automatic email labeling work in Inbox Zero.

## Overall Architecture

```mermaid
graph TB
    Gmail[Gmail] --> PubSub[Google Pub/Sub Topic]
    PubSub --> Subscription[Push Subscription]
    Subscription --> Webhook[/api/google/webhook]
    Webhook --> Validate{Verify Token}
    Validate -->|Invalid| Reject[403 Forbidden]
    Validate -->|Valid| Process[Process History]
    
    Process --> FetchUser[Fetch User Account]
    FetchUser --> CheckPremium{Is Premium?}
    CheckPremium -->|No| Unwatch[Unwatch Emails]
    CheckPremium -->|Yes| CheckRules{Has Rules?}
    
    CheckRules -->|No| Skip[Skip Processing]
    CheckRules -->|Yes| FetchHistory[Fetch Gmail History]
    
    FetchHistory --> ProcessMessages[Process Each Message]
    ProcessMessages --> RunRules[Run Automation Rules]
    RunRules --> ExecuteActions[Execute Actions]
    
    ExecuteActions --> Label[Apply Labels]
    ExecuteActions --> Archive[Archive Threads]
    ExecuteActions --> Reply[Send Replies]
    ExecuteActions --> Other[Other Actions]
    
    Label --> UpdateGmail[Update Gmail via API]
    Archive --> UpdateGmail
    Reply --> UpdateGmail
    Other --> UpdateGmail
    
    UpdateGmail --> SaveDB[Save to Database]
    SaveDB --> Done[Complete]
```

## Detailed Message Processing Flow

```mermaid
sequenceDiagram
    participant Gmail
    participant PubSub as Google Pub/Sub
    participant Webhook as Webhook Endpoint
    participant DB as Database
    participant Rules as Rule Engine
    participant Actions as Action Executor
    participant GmailAPI as Gmail API
    
    Gmail->>PubSub: Email received
    PubSub->>Webhook: Push notification
    
    Webhook->>Webhook: Validate token
    Webhook->>Webhook: Decode message
    Note over Webhook: Extract email & historyId
    
    Webhook->>DB: Fetch user account
    DB-->>Webhook: User data + rules
    
    Webhook->>Webhook: Check premium status
    Webhook->>Webhook: Check AI access
    
    alt Not Premium
        Webhook->>GmailAPI: Unwatch emails
        Webhook-->>PubSub: 200 OK
    else Is Premium
        Webhook->>GmailAPI: Fetch history
        GmailAPI-->>Webhook: History items
        
        loop For each message
            Webhook->>DB: Check if processed
            
            alt Already processed
                Webhook->>Webhook: Skip message
            else New message
                Webhook->>GmailAPI: Get full message
                GmailAPI-->>Webhook: Message details
                
                Webhook->>Webhook: Check ignored senders
                Webhook->>Webhook: Handle assistant emails
                Webhook->>Webhook: Block unsubscribed
                Webhook->>Webhook: Run cold email blocker
                Webhook->>Webhook: Categorize sender
                
                Webhook->>Rules: Run automation rules
                Rules->>Rules: Find matching rule
                Rules->>Rules: Extract action args with AI
                
                Rules->>DB: Save executed rule
                
                Rules->>Actions: Execute actions
                
                loop For each action
                    alt Label Action
                        Actions->>GmailAPI: Get/Create label
                        Actions->>GmailAPI: Apply label to message
                    else Archive Action
                        Actions->>GmailAPI: Archive thread
                    else Reply Action
                        Actions->>GmailAPI: Send reply
                    end
                    
                    Actions->>DB: Save executed action
                end
                
                Actions-->>Rules: Actions complete
                Rules-->>Webhook: Processing complete
            end
        end
        
        Webhook->>DB: Update lastSyncedHistoryId
        Webhook-->>PubSub: 200 OK
    end
```

## Label Action Flow

```mermaid
graph TD
    Start[Label Action Triggered] --> CheckLabelId{Has labelId?}
    
    CheckLabelId -->|Yes| UseLabelId[Use provided labelId]
    CheckLabelId -->|No| CheckLabelName{Has label name?}
    
    CheckLabelName -->|No| Error[Error: No label specified]
    CheckLabelName -->|Yes| LookupLabel[Lookup label by name]
    
    LookupLabel --> LabelExists{Label exists?}
    LabelExists -->|Yes| GetId[Get existing label ID]
    LabelExists -->|No| CreateLabel[Create new label]
    
    CreateLabel --> GetNewId[Get new label ID]
    GetNewId --> UseLabelId
    GetId --> UseLabelId
    
    UseLabelId --> ApplyLabel[Apply label to message]
    ApplyLabel --> CallGmailAPI[Call Gmail API: users.messages.modify]
    
    CallGmailAPI --> APISuccess{API Success?}
    APISuccess -->|Yes| SaveDB[Save to database]
    APISuccess -->|No| RetryOrFail[Retry with backoff]
    
    SaveDB --> Complete[Complete]
    RetryOrFail --> Complete
    
    style CreateLabel fill:#e1f5ff
    style ApplyLabel fill:#fff4e6
    style Complete fill:#e8f5e9
    style Error fill:#ffebee
```

## Rule Matching Process

```mermaid
graph TD
    Email[New Email Received] --> LoadRules[Load User Rules]
    LoadRules --> CheckFilters{Check Static Filters}
    
    CheckFilters -->|Sender filter| CheckSender{Sender matches?}
    CheckFilters -->|Subject filter| CheckSubject{Subject matches?}
    CheckFilters -->|Category filter| CheckCategory{Category matches?}
    CheckFilters -->|Group filter| CheckGroup{Sender in group?}
    
    CheckSender -->|No| TryNext1[Try next rule]
    CheckSubject -->|No| TryNext2[Try next rule]
    CheckCategory -->|No| TryNext3[Try next rule]
    CheckGroup -->|No| TryNext4[Try next rule]
    
    CheckSender -->|Yes| StaticMatch[Static Match]
    CheckSubject -->|Yes| StaticMatch
    CheckCategory -->|Yes| StaticMatch
    CheckGroup -->|Yes| StaticMatch
    
    TryNext1 --> AIMatch[AI Matching]
    TryNext2 --> AIMatch
    TryNext3 --> AIMatch
    TryNext4 --> AIMatch
    
    CheckFilters -->|No filters| AIMatch
    
    AIMatch --> CallAI[Call LLM with email + rule instructions]
    CallAI --> AIDecision{AI says match?}
    
    AIDecision -->|No| NoMatch[No Rule Matched]
    AIDecision -->|Yes| AIMatchResult[AI Match]
    
    StaticMatch --> ExtractArgs[Extract Action Arguments]
    AIMatchResult --> ExtractArgs
    
    ExtractArgs --> NeedsArgs{Needs AI args?}
    NeedsArgs -->|Yes| GetArgs[Call LLM for args]
    NeedsArgs -->|No| UseDefault[Use default args]
    
    GetArgs --> Execute[Execute Actions]
    UseDefault --> Execute
    
    Execute --> SaveRule[Save Executed Rule]
    SaveRule --> Done[Done]
    
    NoMatch --> SaveSkipped[Save as Skipped]
    SaveSkipped --> Done
    
    style StaticMatch fill:#e8f5e9
    style AIMatchResult fill:#fff4e6
    style Execute fill:#e1f5ff
    style NoMatch fill:#f5f5f5
```

## Watch Management Flow

```mermaid
graph TD
    Start[User Signs Up / Enables Rules] --> InitWatch[Initialize Watch]
    
    InitWatch --> CallGmailWatch[Call gmail.users.watch]
    CallGmailWatch --> GmailResponse{Success?}
    
    GmailResponse -->|Yes| GetExpiration[Get expiration date]
    GmailResponse -->|No| LogError[Log error]
    
    GetExpiration --> SaveDB[Save expiration to DB]
    SaveDB --> WatchActive[Watch Active]
    
    WatchActive --> Wait[Wait...]
    Wait --> DaysPass{Days Pass}
    
    DaysPass --> CronRun[Daily Cron Runs]
    CronRun --> CheckExpiration{Expiring soon?}
    
    CheckExpiration -->|No| Continue[Continue waiting]
    CheckExpiration -->|Yes| RenewWatch[Renew Watch]
    
    RenewWatch --> InitWatch
    Continue --> Wait
    
    WatchActive --> ReceiveEmail[Email Received]
    ReceiveEmail --> PubSubNotify[Pub/Sub Notification]
    PubSubNotify --> ProcessEmail[Process Email]
    ProcessEmail --> Wait
    
    LogError --> RetryLater[Retry later]
    RetryLater --> InitWatch
    
    style WatchActive fill:#e8f5e9
    style ProcessEmail fill:#e1f5ff
    style LogError fill:#ffebee
```

## Database Schema (Relevant Tables)

```mermaid
erDiagram
    EmailAccount ||--o{ Rule : has
    EmailAccount ||--o{ ExecutedRule : has
    EmailAccount {
        string id PK
        string email
        string userId
        datetime watchEmailsExpirationDate
        string lastSyncedHistoryId
        string watchEmailsSubscriptionId
        boolean coldEmailBlocker
        boolean autoCategorizeSenders
    }
    
    Rule ||--o{ Action : contains
    Rule ||--o{ ExecutedRule : generates
    Rule {
        string id PK
        string emailAccountId FK
        string name
        text instructions
        boolean enabled
        json staticMatch
    }
    
    Action {
        string id PK
        string ruleId FK
        enum type
        string label
        string labelId
        text content
        integer delayInMinutes
    }
    
    ExecutedRule ||--o{ ExecutedAction : contains
    ExecutedRule {
        string id PK
        string emailAccountId FK
        string ruleId FK
        string threadId
        string messageId
        boolean automated
        enum status
        text reason
        datetime createdAt
    }
    
    ExecutedAction {
        string id PK
        string executedRuleId FK
        enum type
        string label
        string labelId
        enum status
        text error
    }
    
    Newsletter {
        string email PK
        string emailAccountId FK
        string category
        datetime createdAt
    }
```

## Environment & Service Dependencies

```mermaid
graph TB
    subgraph "External Services"
        Gmail[Gmail API]
        PubSub[Google Pub/Sub]
        AI[AI Provider<br/>OpenAI/Anthropic/etc]
    end
    
    subgraph "Application Services"
        WebApp[Next.js App]
        Redis[Redis<br/>Message Lock]
        Postgres[PostgreSQL<br/>Database]
    end
    
    subgraph "Environment Variables"
        GmailCreds[GOOGLE_CLIENT_ID<br/>GOOGLE_CLIENT_SECRET]
        PubSubCreds[GOOGLE_PUBSUB_TOPIC_NAME<br/>GOOGLE_PUBSUB_VERIFICATION_TOKEN]
        AICreds[OPENAI_API_KEY<br/>ANTHROPIC_API_KEY<br/>etc.]
        DBCreds[DATABASE_URL]
        RedisCreds[REDIS_URL]
    end
    
    GmailCreds --> WebApp
    PubSubCreds --> WebApp
    AICreds --> WebApp
    DBCreds --> WebApp
    RedisCreds --> WebApp
    
    WebApp --> Gmail
    WebApp --> AI
    WebApp --> Redis
    WebApp --> Postgres
    
    Gmail --> PubSub
    PubSub --> WebApp
    
    style WebApp fill:#e1f5ff
    style Gmail fill:#fbbc04
    style PubSub fill:#fbbc04
    style AI fill:#e8f5e9
```

## Error Handling Flow

```mermaid
graph TD
    Error[Error Occurs] --> CheckType{Error Type}
    
    CheckType -->|Invalid Grant| InvalidGrant[OAuth token expired]
    CheckType -->|404 Not Found| NotFound[Message not found]
    CheckType -->|Rate Limit| RateLimit[API rate limit hit]
    CheckType -->|Network Error| Network[Network failure]
    CheckType -->|Other| OtherError[Unknown error]
    
    InvalidGrant --> Return200[Return 200 OK]
    InvalidGrant --> LogWarn[Log warning]
    
    NotFound --> SnoozeCheck[Likely snoozed email]
    SnoozeCheck --> SkipMessage[Skip message]
    SkipMessage --> Return200
    
    RateLimit --> Backoff[Exponential backoff]
    Backoff --> Retry[Retry request]
    Retry --> MaxRetries{Max retries?}
    MaxRetries -->|No| Backoff
    MaxRetries -->|Yes| LogError[Log error]
    
    Network --> Retry
    
    OtherError --> Capture[Capture exception]
    Capture --> LogError
    LogError --> Return200
    
    Return200 --> Done[Done - Avoid retry loop]
    
    style Return200 fill:#e8f5e9
    style LogError fill:#ffebee
    style LogWarn fill:#fff4e6
```

## System Health Monitoring

Key metrics to monitor:

1. **Pub/Sub Metrics**
   - Message publish rate
   - Message acknowledgment rate
   - Unacknowledged message count
   - Subscription delivery latency

2. **Application Metrics**
   - Webhook response time
   - Rule execution time
   - Action success rate
   - Error rate by type

3. **Database Metrics**
   - ExecutedRule creation rate
   - ExecutedAction success rate
   - Watch expiration alerts

4. **Gmail API Metrics**
   - API quota usage
   - Rate limit hits
   - Token refresh rate

## Scalability Considerations

```mermaid
graph LR
    subgraph "Horizontal Scaling"
        LB[Load Balancer] --> App1[App Instance 1]
        LB --> App2[App Instance 2]
        LB --> App3[App Instance 3]
    end
    
    subgraph "Message Processing"
        App1 --> Redis[Redis Lock]
        App2 --> Redis
        App3 --> Redis
        Redis --> Prevent[Prevent Duplicate Processing]
    end
    
    subgraph "Data Layer"
        App1 --> DB[(PostgreSQL<br/>Read Replicas)]
        App2 --> DB
        App3 --> DB
    end
    
    PubSub[Google Pub/Sub] --> LB
    
    style Redis fill:#e8f5e9
    style DB fill:#e1f5ff
```

## Performance Optimizations

1. **Redis Locking** - Prevents duplicate processing of same message
2. **Batch Processing** - Processes multiple history items together
3. **Parallel Execution** - Runs multiple actions concurrently
4. **History Limiting** - Limits lookback to avoid processing too many messages
5. **Async Operations** - Uses `after()` for non-critical operations
6. **Database Indexes** - On messageId, threadId, emailAccountId
7. **Caching** - Caches label lookups and user settings

## Security Measures

1. **Token Verification** - Webhook validates token before processing
2. **OAuth Encryption** - Access/refresh tokens encrypted in database
3. **User Isolation** - Users can only access their own data
4. **Rate Limiting** - Prevents abuse of API endpoints
5. **Premium Checks** - Features gated behind premium subscription
6. **Input Validation** - Validates all inputs with Zod schemas

