import { useMachine } from '@xstate/react';
import { assign, createMachine, fromPromise } from 'xstate';

type Health = {
  ok: boolean;
  mongo: 'connected' | 'disabled' | 'error';
};

type Message = {
  id: string;
  text: string;
  createdAt: string;
};

type AppContext = {
  health: Health | null;
  messages: Message[];
  draft: string;
  error: string | null;
};

const appMachine = createMachine({
  types: {} as {
    context: AppContext;
    events:
      | { type: 'REFRESH' }
      | { type: 'TYPE'; value: string }
      | { type: 'SUBMIT' };
  },
  context: {
    health: null,
    messages: [],
    draft: '',
    error: null,
  },
  initial: 'loading',
  states: {
    loading: {
      invoke: {
        src: fromPromise(async () => {
          const [healthResponse, messagesResponse] = await Promise.all([
            fetch('/api/health'),
            fetch('/api/messages'),
          ]);

          if (!healthResponse.ok || !messagesResponse.ok) {
            throw new Error('Failed to load data');
          }

          const health = (await healthResponse.json()) as Health;
          const messagesPayload = (await messagesResponse.json()) as { items: Message[] };

          return { health, messages: messagesPayload.items };
        }),
        onDone: {
          target: 'ready',
          actions: assign(({ event }) => ({
            health: event.output.health,
            messages: event.output.messages,
            error: null,
          })),
        },
        onError: {
          target: 'ready',
          actions: assign({ error: 'Unable to load the app right now.' }),
        },
      },
      on: {
        TYPE: {
          actions: assign({ draft: ({ event }) => event.value }),
        },
      },
    },
    ready: {
      on: {
        REFRESH: 'loading',
        TYPE: {
          actions: assign({ draft: ({ event }) => event.value }),
        },
        SUBMIT: 'submitting',
      },
    },
    submitting: {
      invoke: {
        src: fromPromise(async ({ input }: { input: AppContext }) => {
          const text = input.draft.trim();

          if (!text) {
            throw new Error('Write a message first.');
          }

          const response = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });

          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null;
            throw new Error(payload?.error ?? 'Message save failed.');
          }

          const created = (await response.json()) as Message;
          return created;
        }),
        input: ({ context }) => context,
        onDone: {
          target: 'ready',
          actions: assign(({ context, event }) => ({
            messages: [event.output, ...context.messages].slice(0, 10),
            draft: '',
            error: null,
          })),
        },
        onError: {
          target: 'ready',
          actions: assign({ error: ({ event }) => event.error instanceof Error ? event.error.message : 'Message save failed.' }),
        },
      },
      on: {
        TYPE: {
          actions: assign({ draft: ({ event }) => event.value }),
        },
      },
    },
  },
});

export default function App() {
  const [state, send] = useMachine(appMachine);
  const { health, messages, draft, error } = state.context;

  return (
    <main className="shell">
      <section className="hero card">
        <div>
          <p className="eyebrow">TypeScript + React + Node + MongoDB + XState</p>
          <h1>Small enough to understand in one sitting.</h1>
          <p className="lede">
            A minimal full-stack starter with a React UI, a Node API, and MongoDB-backed messages when a URI is provided.
          </p>
        </div>

        <div className="status">
          <span className={`pill ${health?.mongo ?? 'disabled'}`}>
            MongoDB: {health?.mongo ?? 'loading'}
          </span>
          <button type="button" onClick={() => send({ type: 'REFRESH' })}>
            Refresh
          </button>
        </div>
      </section>

      <section className="card panel">
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            send({ type: 'SUBMIT' });
          }}
        >
          <input
            value={draft}
            onChange={(event) => send({ type: 'TYPE', value: event.target.value })}
            placeholder="Add a note"
            aria-label="Message text"
          />
          <button type="submit" disabled={state.matches('submitting')}>
            {state.matches('submitting') ? 'Saving...' : 'Save'}
          </button>
        </form>

        {error ? <p className="error">{error}</p> : null}

        <ul className="messages">
          {messages.length === 0 ? (
            <li className="empty">No messages yet.</li>
          ) : (
            messages.map((message) => (
              <li key={message.id}>
                <strong>{message.text}</strong>
                <span>{new Date(message.createdAt).toLocaleString()}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}