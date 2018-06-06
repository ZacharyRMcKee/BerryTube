<?php

	define("DB_HOST","bt-mysql");
	define("DB_NAME","berrytube");
	define("DB_USER","berrytube");
	define("DB_PASS","berrytube");
	define("SocketIO_HOST", getenv('DOMAIN'));
	define("SocketIO_PORT", getenv('NODE_HTTPS_PORT'));
	define('CDN_ORIGIN', 'https://' . getenv('CDN_DOMAIN') . ((getenv('HTTPS_PORT') === '443') ? '' : (':' . getenv('HTTPS_PORT'))));
	/* CUT AFTER ME FOR ANY CHANGES. */
	define("PATH","/");

	function cdn($fname) {
		$hash = md5_file($fname);
		if ($hash) {
			return CDN_ORIGIN . "/md5/$hash/$fname";
		} else {
			return $fname;
		}
	}

	$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
	if (mysqli_connect_error()) {
		die('Connect Error (' . mysqli_connect_errno() . ') '. mysqli_connect_error(). " " . DB_HOST);
	}

	session_start();

	// Check for any theme override
	$q = sprintf('SELECT * FROM misc WHERE name = "overrideCss"');
	if ($result = $mysqli->query($q)) {
		if($result->num_rows > 0){
			$row = $result->fetch_object();
			$_SESSION['overrideCss'] = $row->value;
		}
		/* free result set */
		$result->close();
	}

