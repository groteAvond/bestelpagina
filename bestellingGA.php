<?php
/**
 * plugin name: GA bestellingen (wp → supabase)
 * description: wp rest-proxy + shortcode voor bestelformulier (supabase edge function).
 * version: 1.2.1
 */


defined('ABSPATH') || exit;

add_action('rest_api_init', function () {
  register_rest_route('ga/v1', '/bestelling', [
    'methods'  => 'post',
    /**
    * @param wp_rest_request $req
    * @return wp_rest_response
    */
    'callback' => function (wp_rest_request $req) {
      $raw = $req->get_body();
      $body = json_decode($raw, true);

      if (!is_array($body)) {
        return new WP_REST_Response(['errors' => ['Invalid JSON body']], 400);
      }

      if (!isset($body['_payload'], $body['_fieldmap'])) {
        return new WP_REST_Response(['errors' => ['Invalid payload']], 400);
      }

      $formPayload  = $body['_payload'];   // random keys
      $fieldmap = $body['_fieldmap'];  // orig => random

      $allowed = [
        'voornaam',
        'achternaam',
        'email',
        'dagkeuze1',
        'dagkeuze2',
        'vraagAantal',
        'leerlingnummers[]',
      ];

      foreach ($fieldmap as $orig => $rnd) {
        if (!in_array($orig, $allowed, true)) {
          return new WP_REST_Response(['errors' => ['Invalid fieldmap']], 400);
        }
        if (
          (is_array($rnd) && empty($rnd)) ||
          (!is_array($rnd) && !is_string($rnd))
        ) {
          return new WP_REST_Response(['errors' => ['Invalid fieldmap']], 400);
        }
      }

      $normalized = [];

      // === random → origineel vertalen ===
      foreach ($fieldmap as $orig => $rnd) {
        if (is_array($rnd)) {
          $vals = [];
          foreach ($rnd as $r) {
            if (isset($formPayload[$r])) {
              if (is_array($formPayload[$r])) {
                $vals = array_merge($vals, $formPayload[$r]);
              } else {
                $vals[] = $formPayload[$r];
              }
            }
          }
          $normalized[str_replace('[]', '', $orig)] = array_values(array_filter($vals));
        } else {
          $normalized[$orig] = $formPayload[$rnd] ?? '';
        }
      }

      $cfToken = sanitize_text_field($body['cf_token'] ?? '');
      if ($cfToken === '') {
        return new wp_rest_response(['errors' => ['Verificatie vereist.']], 400);
      }

      $verify = wp_remote_post('https://challenges.cloudflare.com/turnstile/v0/siteverify', [
        'timeout' => 10,
        'body' => [
          'secret' => TURNSTILE_SECRET_KEY,
          'response' => $cfToken,
          'remoteip' => $_SERVER['REMOTE_ADDR'] ?? '',
        ],
      ]);
      if (is_wp_error($verify)) {
        return new wp_rest_response(['errors' => ['Verificatie mislukt, probeer later opnieuw.']], 400);
      }
      $verifyBody = json_decode(wp_remote_retrieve_body($verify), true);
      // Debug: tijdelijk loggen om foutcodes te zien
      if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('[Turnstile verify] ' . print_r($verifyBody, true));
      }
      if (empty($verifyBody['success'])) {
        return new wp_rest_response(['errors' => ['Verificatie afgewezen.']], 400);
      }

      // invoer ophalen en sanitiseren
      $voornaam   = sanitize_text_field($normalized['voornaam'] ?? '');
      $achternaam = sanitize_text_field($normalized['achternaam'] ?? '');
      $email      = sanitize_email($normalized['email'] ?? '');
      $dag1       = sanitize_text_field($normalized['dagkeuze1'] ?? '');
      $dag2       = sanitize_text_field($normalized['dagkeuze2'] ?? '');
      $vraagAantal = (int) ($normalized['vraagAantal'] ?? '');
      $leerlingnummers = is_array($normalized['leerlingnummers'] ?? null) ? $normalized['leerlingnummers'] : [];

      // leerlingnummers als array
      $leerlingnummers = array_values(array_filter(array_map(
        fn($v) => trim(sanitize_text_field((string)$v)),
        $leerlingnummers
      )));
      
      // validatie
      $days = ['donderdagAvond','vrijdagMiddag', 'vrijdagAvond'];
      $errors = [];

      if ($voornaam   === '') $errors[] = 'Vul een voornaam in.';
      if ($voornaam !== '' && !preg_match("/^[\p{L}]+(?:[ '-][\p{L}]+)*$/u", $voornaam)) $errors[] = 'Een voornaam bestaat alleen uit letters, met eventueel spaties, apostrof of koppelteken.';
      if (strlen($voornaam) > 50) $errors[] = 'Een voornaam bestaat uit maximaal 50 tekens.';

      if ($achternaam === '') $errors[] = 'Vul een achternaam in.';
      if ($achternaam !== '' && !preg_match("/^[\p{L}]+(?:[ '-][\p{L}]+)*$/u", $achternaam)) $errors[] = 'Een achternaam bestaat alleen uit letters, met eventueel spaties, apostrof of koppelteken.';
      if (strlen($achternaam) > 80) $errors[] = 'Een achternaam bestaat uit maximaal 80 tekens.';

      if ($email === '' || !is_email($email)) $errors[] = 'Vul een geldig e-mailadres in.';
      if (strlen($email) > 254) $errors[] = 'Een e-mailadres bestaat uit maximaal 254 tekens.';

      if ($dag1 === '' || !in_array($dag1, $days, true)) $errors[] = 'Een eerste voorkeursdag kiezen is verplicht, kies uit donderdag-avond, vrijdag-middag of vrijdag-avond.';
      if ($dag2 === '' || !in_array($dag2, $days, true)) $errors[] = 'Een tweede voorkeursdag kiezen is verplicht, kies uit donderdag-avond, vrijdag-middag of vrijdag-avond.';
      if ($dag1 !== '' && $dag2 !== '' && $dag1 === $dag2) $errors[] = 'De eerste en tweede voorkeursdag mogen niet gelijk zijn.';

      $unique = array_values(array_unique($leerlingnummers));
      if (count($unique) !== count($leerlingnummers)) $errors[] = 'Elk leerlingnummer mag slechts één keer worden opgegeven.';
      if (count($leerlingnummers) > 30) $errors[] = 'U kunt maximaal 30 leerlingnummers opgeven.';
      foreach ($leerlingnummers as &$ln) {
        $ln = trim($ln);
        if ($ln === '') continue;
        if (!ctype_digit($ln)) $errors[] = 'Een leerlingnummer moet een cijfer zijn.';
        if (!preg_match('/^11[0-9]{4}$/', $ln)) $errors[] = "Alle leerlingnummers moeten beginnen met '11' gevolgd door 4 cijfers.";
        if (strlen($ln) !== 6) $errors[] = 'Een leerlingnummer bestaat altijd uit 6 cijfers.';
        if (preg_match('/^0+$/', $ln)) { $ln = "0"; }
        if (strlen($ln) <= 0) $errors[] = 'Een leerlingnummer moet een positief getal zijn.';
      }
      unset($ln);

      if (!preg_match('/^[0-9]+$/', $vraagAantal)) $errors[] = 'Het totaal aantal kaarten moet een getal zijn.';
      if ($vraagAantal < 0) $errors[] = 'Het totaal aantal kaarten moet positief zijn.';
      if ($vraagAantal > 30) $errors[] = 'U kunt maximaal 30 kaarten bestellen.';

      if (!empty($errors)) {
        return new wp_rest_response(['errors' => $errors], 400);
      }

      // payload naar supabase
      $supabasePayload = [
        'voornaam'        => $voornaam,
        'achternaam'      => $achternaam,
        'aantalKaarten'   => $vraagAantal,
        'dagkeuze1'       => $dag1,
        'dagkeuze2'       => $dag2,
        'email'           => $email,
        'leerlingnummers' => $leerlingnummers,
      ];

      // doorposten naar supabase edge function
      $function_url = 'https://pfbnjamzbrkdnnjhxbdn.supabase.co/functions/v1/bestellingGA/wp';

      $headers = [
        'content-type'  => 'application/json',
        'x-ga-secret'   => defined('WP_SHARED_SECRET') ? WP_SHARED_SECRET : '',
        'authorization' => 'Bearer ' . (defined('SUPABASE_ANON_KEY') ? SUPABASE_ANON_KEY : ''),
      ];
      $res = wp_remote_post($function_url, [
        'headers' => $headers,
        'body'    => wp_json_encode($supabasePayload),
        'timeout' => 20,
      ]);

      if (is_wp_error($res)) {
        return new wp_rest_response(['errors' => ['Serverfout (wp → supabase).']], 500);
      }
      $response_code = wp_remote_retrieve_response_code($res) ?: 500;
      $raw_body = wp_remote_retrieve_body($res);
      $response_body = json_decode($raw_body, true);

      if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('[SUPABASE HTTP CODE] ' . $response_code);
        error_log('[SUPABASE RAW BODY] ' . $raw_body);
      }

      if ($response_body === null) {
        return new wp_rest_response([
          'errors' => ['Supabase fout: ' . substr($raw_body, 0, 200)]
        ], $response_code ?: 500);
      }

      return new wp_rest_response($response_body, $response_code);
    },
    'permission_callback' => '__return_true',
  ]);
});

/** shortcode met alleen html (geen <script>) */
add_shortcode('bestelformGA', function () {
  $form_ts = microtime(true);
  ob_start(); ?>
  <form id="bestelform" novalidate>
    <input type="hidden" id="form_ts" value="">
    <label for="voornaam">Voornaam<span class="required">*</span></label>
      <input type="text" id="voornaam" placeholder="Voornaam" autocomplete="given-name" required min="1" max="50">
    <label for="achternaam">Achternaam<span class="required">*</span></label>
      <input type="text" id="achternaam" placeholder="Achternaam" autocomplete="family-name" required min="1" max="80">
    <label for="email">E-mailadres<span class="required">*</span> (voor leerlingen en docenten gebruik schoolmail)</label>
      <input type="email" id="email" placeholder="E-mailadres" autocomplete="new-email" required min="1" max="254">
    <label for="dagkeuze1">Kies de eerste voorkeursdag<span class="required">*</span></label>
      <select id="dagkeuze1" required>
        <option value="" disabled selected>-- Kies een dag --</option>
        <optgroup label="Donderdag 9 april">
          <option value="donderdagAvond">Avond</option>
        </optgroup>
        <optgroup label="Vrijdag 10 april">
          <option value="vrijdagMiddag">Middag</option>
          <option value="vrijdagAvond">Avond</option>
        </optgroup>
      </select>
    <label for="dagkeuze2">Kies de tweede voorkeursdag<span class="required">*</span></label>
      <select id="dagkeuze2" required>
        <option value="" disabled selected>-- Kies een dag --</option>
      </select>
    <label for="vraagAantal">Hoeveel kaarten wilt u in totaal bestellen (inclusief uzelf)?<span class="required">*</span></label>
        <input type="number" id="vraagAantal" placeholder="Totaal aantal kaarten" required min="1" max="30" step="1">
    <label for="leerlingnummers">Alle leerlingnummers van leerlingen binnen deze bestelling (voor controle lidmaatschap Io Vivat)</label>
      <div id="leerlingnummersContainer"></div>
    <div id="rolstoelMelding">Om rolstoelplekken te reserveren, kunt u een mail sturen naar <a href="mailto:groteavond@gsr.nl">groteavond@gsr.nl</a>.</div>
    <input type="hidden" id="cf_token" name="cf_token">
    <div class="cf-turnstile"></div>
    <input type="submit" id="formSubmitButton" value="Bestellen!">
  </form>
  <div id="gamsg" style="margin-top:.5rem;"></div>
  <div id="meldingContainer"></div>
  <?php
  return ob_get_clean();
});

/* Externe js en css alleen laden op pagina’s met de shortcode */
add_action('wp_enqueue_scripts', function () {
  if (is_admin()) return;
  if (is_singular()) {
    global $post;
    if ($post && has_shortcode($post->post_content, 'bestelformGA')) {
      // javascript inladen
      wp_enqueue_script(
        'bestellingGA-js',
        plugin_dir_url(__FILE__) . 'bestellingGA.js',
        [],
        '1.2.1',
        true
      );
      wp_localize_script('bestellingGA-js', 'gabest', [
        'resturl' => esc_url_raw( rest_url('ga/v1/bestelling') ),
      ]);
      // css inladen
      wp_enqueue_style(
        'bestellingGA-css',
        plugin_dir_url(__FILE__) . 'bestellingGA.css',
        [],
        '1.1.1'
      );
    }
  }
});
