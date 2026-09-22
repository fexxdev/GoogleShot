export class CancelledError extends Error {
  constructor(message = 'Cancelled.') {
    super(message);
    this.cancelled = true;
  }
}

let cancelRequested = false;

export function requestCancel() {
  cancelRequested = true;
}

export function resetCancel() {
  cancelRequested = false;
}

export function isCancelled() {
  return cancelRequested;
}

export function checkCancelled(message = 'Cancelled.') {
  if (cancelRequested) {
    throw new CancelledError(message);
  }
}
