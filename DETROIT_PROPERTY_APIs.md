# Detroit Property Data APIs Documentation

This document provides comprehensive information about the APIs used to access Detroit property data from the base-unit-tools and parcel-viewer repositories.

## Available APIs

### 1. ArcGIS Feature Services

#### Base Endpoints
- **Production**: `https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services/BaseUnitFeatures/FeatureServer/`
- **Parcel Service**: `https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/parcel_file_current/FeatureServer/0/`

#### Layer Endpoints
- **Addresses**: `/0` - Address points with unit information
- **Streets**: `/1` - Street centerlines
- **Buildings**: `/2` - Building footprints

### 2. Geocoding Service

- **Production**: `https://opengis.detroitmi.gov/opengis/rest/services/BaseUnits/BaseUnitGeocoder/GeocodeServer`
- **Development**: `https://opengis.detroitmi.gov/opengis/rest/services/BaseUnits/BaseUnitGeocoderDev/GeocodeServer`

## Data Structures

### Parcel Data Fields
```javascript
{
  // Identification
  parcel_id: "string",
  address: "string",
  
  // Ownership Information
  taxpayer_1: "string",
  taxpayer_2: "string", 
  taxpayer_address: "string",
  taxpayer_city: "string",
  taxpayer_state: "string",
  taxpayer_zip_code: "string",
  
  // Financial Information
  amt_sale_price: number,
  sale_date: "date",
  amt_taxable_value: number,
  amt_assessed_value: number,
  pct_pre_claimed: number, // Principal Residence Exemption
  
  // Property Classification
  property_class: "string",
  property_class_description: "string",
  use_code: "string",
  use_code_description: "string",
  tax_status_description: "string",
  
  // Physical Attributes
  total_acreage: number,
  total_square_footage: number,
  depth: number,
  frontage: number,
  building_style: "string",
  
  // Zoning & Designation
  zoning_district: "string",
  local_historic_district: "string",
  nez: "string", // Neighborhood Enterprise Zone
  
  // Legal
  legal_description: "string"
}
```

### Address Data Fields
```javascript
{
  address_id: number,
  street_number: "string",
  street_prefix: "string",
  street_name: "string",
  street_type: "string",
  unit_type: "string",
  unit_number: "string"
}
```

### Building Data Fields
```javascript
{
  building_id: number,
  status: "string" // Building status/condition
}
```

### Geocoding Response
```javascript
{
  candidates: [{
    location: { x: number, y: number },
    address: "string",
    score: number,
    attributes: {
      // Various address components and IDs
      User_fld: "string",
      Addr_type: "string",
      // Additional fields depending on match type
    }
  }]
}
```

## API Query Examples

### Query Parcel by ID
```javascript
const queryUrl = `${PARCEL_ENDPOINT}/query`;
const params = {
  where: `parcel_id = '${parcelId}'`,
  outFields: '*',
  returnGeometry: true,
  f: 'geojson',
  outSpatialReference: 4326
};
```

### Query Address by ID
```javascript
const queryUrl = `${ADDRESS_ENDPOINT}/query`;
const params = {
  where: `address_id = ${addressId}`,
  outFields: '*',
  returnGeometry: true,
  f: 'geojson'
};
```

### Geocode an Address
```javascript
const geocodeUrl = `${GEOCODER_ENDPOINT}/findAddressCandidates`;
const params = {
  singleLine: '1234 Main St, Detroit, MI',
  outFields: '*',
  f: 'json'
};
```

### Spatial Query (Find parcels within area)
```javascript
const params = {
  geometry: JSON.stringify(polygon),
  geometryType: 'esriGeometryPolygon',
  spatialRel: 'esriSpatialRelIntersects',
  outFields: '*',
  returnGeometry: true,
  f: 'geojson'
};
```

## Authentication

Currently, these APIs do not require authentication and are publicly accessible. However, be mindful of:
- Rate limiting
- Appropriate usage
- Caching responses to reduce server load

## Response Formats

All feature services support multiple output formats:
- `json` - Esri JSON format
- `geojson` - GeoJSON format (recommended for web mapping)
- `pjson` - Pretty-printed JSON

## Error Handling

Common error responses:
- `400` - Bad request (invalid query parameters)
- `404` - Layer or service not found
- `500` - Server error

Always check for:
```javascript
if (response.error) {
  console.error(response.error.message);
}
```

## Usage Notes

1. **Performance**: Use field filtering (`outFields`) to only request needed data
2. **Geometry**: Specify `outSpatialReference: 4326` for standard lat/lng
3. **Pagination**: Large queries may require pagination using `resultOffset` and `resultRecordCount`
4. **Caching**: Implement client-side caching for frequently accessed data