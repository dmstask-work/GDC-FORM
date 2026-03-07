window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbGJ3cnpmbXdoYmxjbm9hanNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NjEyMTcsImV4cCI6MjA4NzAzNzIxN30.Z4pZnnrWALOpvLx4gP0nEoUckKJf9Ja43Y3P--TZcIs",
  TABLE_NAME: "customer_submissions",
  SALES_TABLE_NAME: "sales_master",
  ACTIVITY_TABLE_NAME: "sales_activities",
  STORAGE_BUCKET: "customer-photos",
  // Optional. For province/city/district/subdistrict dropdown source in Call mode.
  WILAYAH_API_BASE_URL: "https://www.emsifa.com/api-wilayah-indonesia/api",
  // Optional. Leave empty to auto-use: ${SUPABASE_URL}/functions/v1/reverse-geocode
  REVERSE_GEOCODE_URL: ""
};
