# Adaptation report

_This app was brought onto the Keshet starter by the onboarding plugin. Your
original project was not changed - it is still in its own folder as a backup.
This report is in plain language; you do not need to be a developer to read
it._

## What this app is

<one or two sentences, from the builder's own description at the intake>

## Where it lives now

- New version (work here from now on): `<path to the new starter base>`
- Your original (untouched backup): `<path to the source project>`

## What was carried over

<the screens, flows, look and behaviour that made it across, in plain terms>

## What was rebuilt differently, and why

<anything that now works in a different way because the starter does it that
way - routing, state, styling, how a widget is embedded - each with a one-line
reason>

## What needs your attention

<the important part: anything NOT carried over, anything that could not be
fully reproduced, anything the builder should check or decide. If there is
nothing, say so plainly.>

## Secrets that were moved

<any keys, tokens or connection strings that were found in the old code and
moved into the app's private .env file so they are not in the code. Names
only, never values. If none were found, say so.>

Full handling of these secrets happens later, when the app is deployed - the
deploy step checks them properly. For now they are out of the code and out of
version control.

## How to run it locally

```
pnpm dev
```

Then open the address it prints and try the app.

## What comes next

When you want other people to be able to open this app, say so - "deploy",
"share it", "put it live" - and the deployment step takes over from there.
Nothing is sent anywhere until you ask.
