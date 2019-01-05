using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Hubs
{
    [Authorize(JwtBearerDefaults.AuthenticationScheme)]
    public class HubWithAuthorization : Hub
    {
        public string Echo(string message)
        {
            return message;
        }
    }
}
