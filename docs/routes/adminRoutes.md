# Admin Routes (`/routes/adminRoutes.js`)

Defines API routes related to administrative functions, primarily managed by users with the 'admin' role. These routes handle operations for hostels, wardens, associate wardens, security, maintenance staff, and user password updates.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`hostelController.js`](../controllers/hostelController.md)
  - [`adminController.js`](../controllers/adminController.md)
  - [`wardenController.js`](../controllers/wardenController.md)
  - [`associateWardenController.js`](../controllers/associateWardenController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)
  - [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles) (Currently commented out, but intended for role-based access control)

## Base Path

All routes defined in this file are mounted under `/api/v1/admin` (assuming `/admin` is the prefix used in `server.js`).

## Middleware Applied

1.  [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Ensures the user is logged in before accessing any admin route.
2.  `authorizeRoles(['admin'])`: (Commented out) Intended to restrict access to users with the 'admin' role.

## Routes

**Hostel Management**

- `GET /hostels`: Get a list of hostels ([`getHostels`](../controllers/hostelController.md#gethostelsreq-res)).
- `POST /hostel`: Add a new hostel ([`addHostel`](../controllers/hostelController.md#addhostelreq-res)).
- `PUT /hostel/:id`: Update an existing hostel ([`updateHostel`](../controllers/hostelController.md#updatehostelreq-res)).
- `GET /hostel/list`: Get a simplified list of hostels (names and IDs) ([`getHostelList`](../controllers/hostelController.md#gethostellistreq-res)).

**Warden Management**

- `GET /wardens`: Get all wardens ([`getAllWardens`](../controllers/wardenController.md#getallwardensreq-res)).
- `POST /warden`: Create a new warden ([`createWarden`](../controllers/wardenController.md#createwardenreq-res)).
- `PUT /warden/:id`: Update a warden ([`updateWarden`](../controllers/wardenController.md#updatewardenreq-res)).
- `DELETE /warden/:id`: Delete a warden ([`deleteWarden`](../controllers/wardenController.md#deletewardenreq-res)).

**Associate Warden Management**

- `GET /associate-wardens`: Get all associate wardens ([`getAllAssociateWardens`](../controllers/associateWardenController.md#getallassociatewardensreq-res)).
- `POST /associate-warden`: Create a new associate warden ([`createAssociateWarden`](../controllers/associateWardenController.md#createassociatewardenreq-res)).
- `PUT /associate-warden/:id`: Update an associate warden ([`updateAssociateWarden`](../controllers/associateWardenController.md#updateassociatewardenreq-res)).
- `DELETE /associate-warden/:id`: Delete an associate warden ([`deleteAssociateWarden`](../controllers/associateWardenController.md#deleteassociatewardenreq-res)).

**Security Staff Management**

- `GET /security`: Get all security staff ([`getAllSecurities`](../controllers/adminController.md#getallsecuritiesreq-res)).
- `POST /security`: Create new security staff ([`createSecurity`](../controllers/adminController.md#createsecurityreq-res)).
- `PUT /security/:id`: Update security staff ([`updateSecurity`](../controllers/adminController.md#updatesecurityreq-res)).
- `DELETE /security/:id`: Delete security staff ([`deleteSecurity`](../controllers/adminController.md#deletesecurityreq-res)).

**Maintenance Staff Management**

- `GET /maintenance`: Get all maintenance staff ([`getAllMaintenanceStaff`](../controllers/adminController.md#getallmaintenancestaffreq-res)).
- `POST /maintenance`: Create new maintenance staff ([`createMaintenanceStaff`](../controllers/adminController.md#createmaintenancestaffreq-res)).
- `PUT /maintenance/:id`: Update maintenance staff ([`updateMaintenanceStaff`](../controllers/adminController.md#updatemaintenancestaffreq-res)).
- `DELETE /maintenance/:id`: Delete maintenance staff ([`deleteMaintenanceStaff`](../controllers/adminController.md#deletemaintenancestaffreq-res)).

**User Management**

- `POST /user/update-password`: Update the password for a user (likely the logged-in admin or another user specified in the body) ([`updateUserPassword`](../controllers/adminController.md#updateuserpasswordreq-res)).
