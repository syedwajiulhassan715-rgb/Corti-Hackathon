// Log to offer chains. Offer expiry is derived at read time from now, never fired.
//
// Pure function of the event log. No network, no stored state.
// Takes `now` as an explicit argument (D8). Never calls Date.now().
// Live passes Date.now(); replay passes the timestamp of the last event read.
