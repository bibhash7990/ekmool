import { useDispatch, useSelector } from "react-redux";

import type { AppDispatch, RootState } from "@/store";

/**
 * Typed `useDispatch` / `useSelector`.
 *
 * `withTypes` rather than the older `TypedUseSelectorHook` cast: it is the
 * react-redux 9 API for exactly this, and it gets the dispatch overloads
 * (thunks included) right without a cast that would also swallow a genuine
 * mistake.
 *
 * Screens import these and never the untyped originals — a `useSelector`
 * without the state type infers `any` for its argument, which is the one way
 * `any` gets into a component in a project that has banned it.
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
