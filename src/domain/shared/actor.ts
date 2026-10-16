// Who is acting in a user use case. Transports authenticate and build it;
// the domain uses it to scope queries, which is where access is enforced.
export type Actor = { userId: string };
