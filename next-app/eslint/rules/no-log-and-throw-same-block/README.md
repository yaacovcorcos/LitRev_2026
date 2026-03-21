# litrev/no-log-and-throw-same-block

Logging an error and then throwing it in the same block usually duplicates error reporting and obscures which layer is responsible for handling the failure.
