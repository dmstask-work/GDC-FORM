// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");

    if (!lat || !lon) {
      return new Response(JSON.stringify({ error: "lat and lon are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const geoapifyKey = Deno.env.get("GEOAPIFY_KEY");
    if (!geoapifyKey) {
      return new Response(JSON.stringify({ error: "Missing GEOAPIFY_KEY in function secrets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const endpoint = `https://api.geoapify.com/v1/geocode/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&apiKey=${encodeURIComponent(geoapifyKey)}`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      const upstreamText = await response.text();
      return new Response(JSON.stringify({
        error: "Geoapify request failed",
        upstream_status: response.status,
        upstream_detail: upstreamText || "empty response from Geoapify"
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const props = data?.features?.[0]?.properties || {};

    const streetParts = [props.street, props.housenumber].filter(Boolean);
    const streetAddress = streetParts.join(" ").trim() || props.address_line1 || "";
    const province = props.state || props.province || "";
    const city = props.city || props.county || props.state_district || "";
    const district = props.district || props.suburb || props.city_district || "";
    const subdistrict = props.suburb || props.quarter || props.neighbourhood || "";
    const address = props.formatted || [streetAddress, subdistrict, district, city, province].filter(Boolean).join(", ");

    return new Response(JSON.stringify({
      address,
      streetAddress,
      province,
      city,
      district,
      subdistrict
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
