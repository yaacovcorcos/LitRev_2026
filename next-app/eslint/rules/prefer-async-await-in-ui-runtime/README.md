# litrev/prefer-async-await-in-ui-runtime

Promise chains in UI/runtime code often hide sequencing and error behavior. Prefer `async` / `await` unless the chain is a deliberate dynamic import or low-level infrastructure primitive.
