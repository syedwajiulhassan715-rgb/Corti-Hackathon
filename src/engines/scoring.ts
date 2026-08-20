// S8 Scoring. Urgency, wait, dependency, fit. Doctor's weights. wait is measured against now.
//
// Pure function of the event log. No network, no stored state.
// Takes `now` as an explicit argument (D8). Never calls Date.now().
// Live passes Date.now(); replay passes the timestamp of the last event read.
