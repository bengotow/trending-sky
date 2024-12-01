-- change any of this you like

CREATE DATABASE bsky;

CREATE TABLE bsky_users (
  did TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  handle TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL
);

CREATE TABLE bsky_reposts (
  id SERIAL PRIMARY KEY,
  did TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  post_uri TEXT NOT NULL
);

CREATE TABLE bsky_replies (
  id SERIAL PRIMARY KEY,
  did TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  post_uri TEXT NOT NULL,
  post_text TEXT NOT NULL,
  root_uri TEXT NOT NULL,
  parent_uri TEXT NOT NULL
);

CREATE TABLE bsky_likes (
  id SERIAL PRIMARY KEY,
  did TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  post_uri TEXT NOT NULL
);

CREATE TABLE bsky_urls (
  id SERIAL PRIMARY KEY,
  did TEXT NOT NULL,
  uri TEXT NOT NULL,
  thumb jsonb DEFAULT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  post_uri TEXT NOT NULL,
  post_text TEXT NOT NULL
);

CREATE INDEX bsky_urls_url_idx ON bsky_urls (url);
