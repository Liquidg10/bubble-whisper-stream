# Google Maps browser key contract

Mind Manual loads the Google Maps JavaScript API only when a place lookup is
requested and `VITE_GOOGLE_MAPS_API_KEY` is configured. The value is a browser
key, so it is visible to visitors by design and must be protected in Google
Cloud rather than treated as a secret.

The browser contract has two privacy controls:

- `index.html` uses `Referrer-Policy: strict-origin`. HTTPS requests disclose
  only the site's origin, never a page path or query string, and disclose no
  referrer on an HTTPS-to-HTTP downgrade.
- The Maps loader sends `auth_referrer_policy=origin`, so Maps authorization
  also uses only the origin.

For that loader parameter to work, the key's website restriction must match
each allowed HTTPS domain without relying on a specific page path. Restrict the
same key to only the Maps JavaScript API and Places API. The latter backs the
legacy `google.maps.places.PlacesService` caller in this app; Places API (New)
is not part of this loader's current contract.
Keep local development origins separate from production and add only origins
that are intentionally supported.

Changing this repository does not update Google Cloud credentials, provider
restrictions, hosted environment variables, or a deployed build. Verify those
boundaries separately during an authorized credential/release operation.

References:

- [Load the Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/load-maps-js-api#optional_parameters_direct)
- [Google Maps Platform API security best practices](https://developers.google.com/maps/api-security-best-practices)
