// @generated automatically by Diesel CLI.

diesel::table! {
    use diesel::sql_types::*;
    use pgvector::sql_types::*;

    crawling_settings (id) {
        id -> Uuid,
        version_id -> Uuid,
        prefix_path -> Nullable<Text>,
        anti_paths -> Nullable<Text>,
        anti_keywords -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use pgvector::sql_types::*;

    documentation_embeddings (id) {
        id -> Uuid,
        snippet_id -> Uuid,
        embedding -> Vector,
        created_at -> Timestamp,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use pgvector::sql_types::*;

    documentation_snippets (id) {
        id -> Uuid,
        title -> Text,
        description -> Text,
        content -> Text,
        source_url -> Text,
        technology_id -> Uuid,
        version_id -> Uuid,
        concepts -> Nullable<Array<Nullable<Text>>>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use pgvector::sql_types::*;

    documentation_urls (id) {
        id -> Uuid,
        technology_id -> Uuid,
        version_id -> Uuid,
        url -> Text,
        status -> Text,
        html -> Nullable<Text>,
        markdown -> Nullable<Text>,
        cleaned_markdown -> Nullable<Text>,
        is_processed -> Bool,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use pgvector::sql_types::*;

    language_options (id) {
        id -> Uuid,
        language -> Text,
        use_count -> Int4,
        last_used -> Timestamp,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use pgvector::sql_types::*;

    proxies (id) {
        id -> Uuid,
        url -> Text,
        last_used -> Nullable<Timestamp>,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use pgvector::sql_types::*;

    technologies (id) {
        id -> Uuid,
        name -> Text,
        language -> Nullable<Text>,
        related -> Nullable<Array<Nullable<Text>>>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use pgvector::sql_types::*;

    technology_versions (id) {
        id -> Uuid,
        technology_id -> Uuid,
        version -> Text,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::joinable!(crawling_settings -> technology_versions (version_id));
diesel::joinable!(documentation_embeddings -> documentation_snippets (snippet_id));
diesel::joinable!(documentation_snippets -> technologies (technology_id));
diesel::joinable!(documentation_snippets -> technology_versions (version_id));
diesel::joinable!(documentation_urls -> technologies (technology_id));
diesel::joinable!(documentation_urls -> technology_versions (version_id));
diesel::joinable!(technology_versions -> technologies (technology_id));

diesel::allow_tables_to_appear_in_same_query!(
    crawling_settings,
    documentation_embeddings,
    documentation_snippets,
    documentation_urls,
    language_options,
    proxies,
    technologies,
    technology_versions,
);
