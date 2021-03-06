<?php

$theme = $_GET['theme'];
assert(strpos($theme, '.') === false);

header('Content-Type: text/css');
require_once('../../config.php');

$source = file_get_contents("css/$theme/colors.css");
echo preg_replace_callback(
    '/url\([\'"]?([^)]+)[\'"]?\)/i',
    function ($matches) {
        global $theme;
        $url = $matches[1];
        if (substr($url, 0, 7) === 'images/') {
            $url = cdn("/plugins/toastthemes/css/$theme/$url");
        } else if (substr($url, 0, 8) === '/images/') {
            $url = cdn($url);
        }
        $url = str_replace("'", "\\'", $url);
        return "url('$url')";
    },
    $source
);
