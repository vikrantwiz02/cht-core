declare module 'enketo-core/src/js/event' {
  const events: {
    BeforeSave: () => CustomEvent;
    [key: string]: (...args: unknown[]) => Event;
  };
  export default events;
}
