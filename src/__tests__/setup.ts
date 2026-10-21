import { configure } from "@testing-library/dom";

// findBy* and waitFor wait at most this long. The default (1 s) is too tight for the App tests on a
// slow CI runner (the macOS x64 runner failed twice on it); fast machines still return immediately.
configure({ asyncUtilTimeout: 5_000 });
