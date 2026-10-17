use std::{
    collections::VecDeque,
    sync::{Mutex, PoisonError},
};

#[cfg(not(test))]
use std::io::Write;

use serde::Serialize;

const MAX_BACKEND_DIAGNOSTICS: usize = 50;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendDiagnosticEvent {
    pub component: &'static str,
    pub code: &'static str,
}

#[derive(Default)]
pub struct BackendDiagnostics {
    events: Mutex<VecDeque<BackendDiagnosticEvent>>,
}

impl BackendDiagnostics {
    pub fn record(&self, component: &'static str, code: &'static str) {
        let mut events = self.events.lock().unwrap_or_else(PoisonError::into_inner);
        if events.len() == MAX_BACKEND_DIAGNOSTICS {
            events.pop_front();
        }
        events.push_back(BackendDiagnosticEvent { component, code });
        drop(events);

        #[cfg(not(test))]
        {
            let stderr = std::io::stderr();
            let mut terminal = stderr.lock();
            let _ = writeln!(terminal, "TiviHub backend error [{component}/{code}]");
        }
    }

    pub fn snapshot(&self) -> Vec<BackendDiagnosticEvent> {
        self.events
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::{BackendDiagnostics, MAX_BACKEND_DIAGNOSTICS};

    #[test]
    fn keeps_only_a_bounded_list_of_backend_errors() {
        let diagnostics = BackendDiagnostics::default();

        for _ in 0..MAX_BACKEND_DIAGNOSTICS + 5 {
            diagnostics.record("chromecast", "CAST_START_FAILED");
        }

        assert_eq!(diagnostics.snapshot().len(), MAX_BACKEND_DIAGNOSTICS);
    }
}
