---
name: forms
description: Use whenever adding a form, handling a submit, writing a Server Action, or touching useActionState / useFormStatus / useOptimistic in this project. The old React 18 pattern (useState + onSubmit + fetch) is wrong here — React 19 + Next 16 App Router use Server Actions and useActionState instead, and this skill shows the correct end-to-end pattern. Trigger on "form", "submit", "Server Action", "useActionState", "useFormStatus", "useOptimistic", "contact form", "login form", "search form", "file upload", "multi-step form", or any request to capture user input and send it somewhere.
---

# Forms & Server Actions

React 19 changed how forms work. The old pattern (`useState` + `onSubmit` + `fetch`) still runs, but it's unnecessary code solving problems the new pattern handles for free.

> **Type signatures only:** see the `react-19` skill for the exact TypeScript signatures of `useActionState`, `useFormStatus`, and `useOptimistic`, and why imports moved (`useActionState` is from `react`; `useFormStatus` is from `react-dom`). This skill focuses on the end-to-end structure and FSD placement.

## The pattern in three parts

Every form in this project follows the same shape: one file per responsibility.

| Part           | Where                                     | Directive      | Purpose                                                              |
| -------------- | ----------------------------------------- | -------------- | -------------------------------------------------------------------- |
| Server Action  | `src/features/<name>/api/<actionName>.ts` | `'use server'` | Validates input, persists data, returns result                       |
| Form component | `src/features/<name>/ui/<Name>Form.tsx`   | `'use client'` | Wires the action to the form via `useActionState`                    |
| Submit button  | `src/features/<name>/ui/SubmitButton.tsx` | `'use client'` | Reads pending state via `useFormStatus`; must be a child of the form |

## Complete example — feedback form

### Part 1: Server Action

`src/features/send-feedback/api/sendFeedback.ts`

```ts
'use server';

export type FeedbackState = {
  error: string | null;
  success: boolean;
};

export async function sendFeedback(
  _prev: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  const message = formData.get('message');

  if (typeof message !== 'string' || message.trim().length === 0) {
    return { error: 'Message is required.', success: false };
  }

  await db.feedback.create({ message: message.trim() }); // your actual call

  return { error: null, success: true };
}
```

What `'use server'` does: marks every export in this file as a Server Action. The function runs on the server when the form is submitted — the client never sees the implementation, only the result.

The signature is always `(previousState, payload) => newState`. For a `<form>`, the payload is `FormData` — React serializes the form fields automatically.

Return validation errors as state, not thrown exceptions. `throw` is for unexpected failures, not "the user left a field blank."

### Part 2: Form component

`src/features/send-feedback/ui/FeedbackForm.tsx`

```tsx
'use client';

import { useActionState } from 'react';
import { sendFeedback, type FeedbackState } from '../api/sendFeedback';
import { SubmitButton } from './SubmitButton';

const initialState: FeedbackState = { error: null, success: false };

export function FeedbackForm() {
  // useActionState returns a 3-tuple: [state, formAction, isPending]
  const [state, formAction, isPending] = useActionState(sendFeedback, initialState);

  if (state.success) {
    return <p role="status">Thanks for your feedback!</p>;
  }

  return (
    <form action={formAction}>
      <label htmlFor="message">Message</label>
      <textarea
        id="message"
        name="message"
        required
        aria-required="true"
        aria-invalid={state.error ? 'true' : undefined}
        aria-describedby={state.error ? 'message-error' : undefined}
      />
      {state.error && (
        <span id="message-error" role="alert">
          {state.error}
        </span>
      )}
      <SubmitButton isPending={isPending} />
    </form>
  );
}
```

`'use client'` is required because `useActionState` is a hook — hooks are client-only.

`action={formAction}` replaces `onSubmit`. You never call `e.preventDefault()`. React handles serializing the fields into `FormData` and passing it to the Server Action.

`isPending` from the 3-tuple mirrors `useFormStatus().pending` for the whole action — use it to disable unrelated UI outside the form. For the submit button itself, prefer `useFormStatus`.

### Part 3: Submit button

`src/features/send-feedback/ui/SubmitButton.tsx`

```tsx
'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({ isPending }: { isPending?: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = pending || isPending;
  return (
    <button type="submit" disabled={isDisabled} aria-busy={isDisabled}>
      {isDisabled ? 'Sending…' : 'Send feedback'}
    </button>
  );
}
```

`useFormStatus` reads the status of the **parent** `<form>`. It always returns `{ pending: false }` if called in the same component that renders `<form>` — it has no parent form to observe at that point. This is the reason `SubmitButton` is a separate component.

### Part 4: Slice public surface

`src/features/send-feedback/index.ts`

```ts
export { FeedbackForm } from './ui/FeedbackForm';
// The Server Action is an implementation detail of this slice — don't export it.
```

### Part 5: Using the form from a widget

`src/widgets/feedback-panel/ui/FeedbackPanel.tsx`

```tsx
// No directive — Server Component by default
import { FeedbackForm } from '@/features/send-feedback';

export function FeedbackPanel() {
  return (
    <section>
      <h2>Leave feedback</h2>
      <FeedbackForm />
    </section>
  );
}
```

The widget stays a Server Component. The client boundary is inside `FeedbackForm`.

## Validation with Zod

Prefer Zod for multi-field forms — it handles type coercion and produces structured field errors automatically.

```ts
'use server';

import { z } from 'zod';

const CreatePostSchema = z.object({
  title: z.string().min(1, 'Required'),
  body: z.string().min(10, 'At least 10 characters'),
});

export type CreatePostState = {
  fieldErrors: Partial<Record<'title' | 'body', string[]>>;
  error: string | null;
  success: boolean;
};

export async function createPost(
  _prev: CreatePostState,
  formData: FormData,
): Promise<CreatePostState> {
  const raw = {
    title: formData.get('title'),
    body: formData.get('body'),
  };

  const result = CreatePostSchema.safeParse(raw);

  if (!result.success) {
    return {
      fieldErrors: result.error.flatten().fieldErrors,
      error: null,
      success: false,
    };
  }

  await db.posts.create(result.data);
  return { fieldErrors: {}, error: null, success: true };
}
```

Display field errors next to their inputs:

```tsx
<label htmlFor="title">Title</label>
<input
  id="title"
  name="title"
  aria-invalid={!!state.fieldErrors?.title?.length}
  aria-describedby={state.fieldErrors?.title?.length ? 'title-error' : undefined}
/>
{state.fieldErrors?.title?.map((msg) => (
  <span key={msg} id="title-error" role="alert">{msg}</span>
))}
```

For forms with only one or two fields, manual validation is fine. Reach for Zod when you have three or more fields, custom error messages, or complex conditional rules.

## Accessibility

Rules that apply to every form:

| Pattern                  | Requirement                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Associate labels         | Use `<label htmlFor="id">` + matching `id` on the input, or wrap the input inside the label |
| Required fields          | `required` HTML attribute + `aria-required="true"`                                          |
| Error association        | `aria-describedby="error-id"` on the input; the error element carries that `id`             |
| Invalid state            | `aria-invalid="true"` on the input when it has a field error                                |
| Live error announcements | `role="alert"` on error messages so screen readers read them automatically                  |
| Success messages         | `role="status"` on success messages (polite, not disruptive)                                |
| Busy button              | `aria-busy={pending}` on the submit button while the action runs                            |
| Focus management         | After a failed server submission, move focus to the error summary (see below)               |

### Focus management after server errors

```tsx
const errorSummaryRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (state.error || Object.keys(state.fieldErrors ?? {}).length > 0) {
    errorSummaryRef.current?.focus();
  }
}, [state]);

// In JSX:
{
  state.error && (
    <div
      ref={errorSummaryRef}
      role="alert"
      tabIndex={-1} // makes it focusable programmatically
    >
      {state.error}
    </div>
  );
}
```

## Form reset after success

By default, uncontrolled inputs keep their last values after a successful submission. Two approaches:

**Option A — `key` prop (preferred for uncontrolled inputs):** Give the form a key tied to the number of successful submissions. React unmounts and remounts the form when the key changes, clearing all native inputs.

```tsx
const [submitCount, setSubmitCount] = useState(0);
const [state, formAction] = useActionState(sendFeedback, initialState);

useEffect(() => {
  if (state.success) setSubmitCount((n) => n + 1);
}, [state.success]);

return (
  <form key={submitCount} action={formAction}>
    …
  </form>
);
```

**Option B — `ref.reset()`:** Call the native form reset method imperatively. Useful when you want to keep the form mounted (e.g. to animate a success banner above it).

```tsx
const formRef = useRef<HTMLFormElement>(null);

useEffect(() => {
  if (state.success) formRef.current?.reset();
}, [state.success]);

return (
  <form ref={formRef} action={formAction}>
    …
  </form>
);
```

## Optimistic updates with `useOptimistic`

Use `useOptimistic` when the server round-trip would make the UI feel slow and the operation is low-risk (e.g. adding an item to a list, toggling a like).

```tsx
'use client';

import { useActionState, useOptimistic, useTransition } from 'react';
import { addItem } from '../api/addItem';

export function ItemList({ initialItems }: { initialItems: Item[] }) {
  const [, formAction] = useActionState(addItem, null);
  const [isPending, startTransition] = useTransition();

  const [optimisticItems, addOptimistic] = useOptimistic(initialItems, (current, newItem: Item) => [
    ...current,
    { ...newItem, pending: true },
  ]);

  function handleSubmit(formData: FormData) {
    const label = formData.get('label') as string;
    startTransition(async () => {
      addOptimistic({ id: crypto.randomUUID(), label });
      await formAction(formData);
    });
  }

  return (
    <>
      <ul>
        {optimisticItems.map((item) => (
          <li key={item.id} style={{ opacity: item.pending ? 0.5 : 1 }}>
            {item.label}
          </li>
        ))}
      </ul>
      <form action={handleSubmit}>
        <input name="label" required />
        <button type="submit" disabled={isPending}>
          Add
        </button>
      </form>
    </>
  );
}
```

`useOptimistic` always reverts the optimistic state when the action settles — React replaces it with whatever the server returned (or the original state on error). Don't manually undo it.

## File uploads

`FormData` carries `File` objects natively — no extra encoding needed. Validate the type in the Server Action.

```ts
'use server';

export type UploadState = { error: string | null; url: string | null };

export async function uploadAvatar(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const file = formData.get('avatar');

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Please select a file.', url: null };
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { error: 'JPEG, PNG, or WebP only.', url: null };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: 'File must be under 5 MB.', url: null };
  }

  const url = await storage.upload(file); // your actual storage call
  return { error: null, url };
}
```

Form side — the only difference from a text form is `encType`:

```tsx
<form action={formAction} encType="multipart/form-data">
  <label htmlFor="avatar">Profile picture</label>
  <input id="avatar" name="avatar" type="file" accept="image/*" />
  {state.error && <span role="alert">{state.error}</span>}
  <SubmitButton />
</form>
```

For large files or progress reporting, reach for a dedicated upload API route (`app/api/upload/route.ts`) with streaming — Server Actions buffer the entire payload before the function runs.

## Multi-step forms

Two approaches depending on whether steps need to be bookmarkable.

**URL-based steps (bookmarkable):** Each step is a separate route. Data passes between steps via a draft record in the database or an encrypted cookie. Each step's Server Action writes to the draft and redirects to the next route.

```
/onboarding/step-1 → /onboarding/step-2 → /onboarding/review → /onboarding/done
```

**State-based steps (single page):** Track `currentStep` in component state. Each step renders its own set of fields inside the same `<form>`. A single Server Action receives all accumulated `FormData` from the final step, or each step has its own action that returns the merged state.

```tsx
'use client';

import { useState } from 'react';

export function OnboardingForm() {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  return (
    <form action={step < 3 ? () => setStep((s) => (s + 1) as 2 | 3) : finalAction}>
      {step === 1 && <StepOne />}
      {step === 2 && <StepTwo />}
      {step === 3 && <ReviewStep />}
      <button type="submit">{step < 3 ? 'Next' : 'Submit'}</button>
    </form>
  );
}
```

Prefer URL-based steps for onboarding flows where a page refresh should not lose data. Use state-based for short wizards (2–3 steps) where the overhead of a draft record isn't justified.

## Why the action lives in `features/<name>/api/`

FSD rule: each layer imports only from layers below it. A Server Action that writes data is a user-initiated mutation — that is `features` territory. The `api/` subfolder within a slice holds the server-side code: Server Actions, data-fetching helpers, and route handlers for that slice.

Where **not** to put a Server Action:

| Wrong location                   | Why wrong                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `shared/`                        | Shared code carries no business logic; actions that write data don't belong there |
| `widgets/`                       | Widgets compose UI — they don't own mutation logic                                |
| `app/api/` route handlers        | Those are HTTP endpoints; form submissions don't need them                        |
| Root level of `features/<name>/` | The `/api/` subfolder makes the server boundary visible at a glance               |

## The old pattern — recognize and stop

If you see code like this, replace it with the pattern above:

```tsx
// OLD — React 18 style, do not write this
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault(); // red flag #1
  setLoading(true);
  try {
    await fetch('/api/feedback', {
      // red flag #2 — calling your own API
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  } catch {
    setError('Something went wrong.');
  } finally {
    setLoading(false); // red flag #3 — manual state tracking
  }
}

return <form onSubmit={handleSubmit}>…</form>;
```

Problems: manual loading/error state that `useActionState` provides for free; a `fetch` call to your own API that a Server Action replaces; `e.preventDefault()` that the new pattern never needs; no progressive enhancement (requires JavaScript to submit).

## Common mistakes

| Mistake                                                       | Fix                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `import { useFormState } from 'react-dom'`                    | `import { useActionState } from 'react'` — renamed in React 19                           |
| `const [state, action] = useActionState(…)`                   | Returns a 3-tuple: `[state, action, isPending]` — don't drop the third element           |
| `useFormStatus()` in the component that renders `<form>`      | Move it into a child rendered inside the form (e.g. `<SubmitButton />`)                  |
| `<form onSubmit={handler}>` with `e.preventDefault()`         | `<form action={formAction}>` — React handles submission                                  |
| Throwing an error from a Server Action for bad input          | Return it as state: `return { error: 'Invalid.' }` — throw only for unexpected failures  |
| Missing `'use server'` on the action file                     | Required; without it the function is not a Server Action and runs client-side            |
| Missing `'use client'` on the form component                  | `useActionState` is a hook — hooks require a Client Component                            |
| Server Action in `shared/`                                    | Business-logic mutations live in `features/<name>/api/`                                  |
| No `aria-invalid` or `aria-describedby` on inputs with errors | Screen readers won't associate the error message with the field — add both               |
| Forgetting `role="alert"` on error messages                   | Dynamic errors injected into the DOM must carry `role="alert"` to be announced           |
| Large file uploaded via Server Action                         | Server Actions buffer the full payload; use an `app/api/upload/route.ts` for large files |
| Calling `useOptimistic` without `useTransition`               | `addOptimistic` must be called inside `startTransition`; without it React will warn      |
