/*
 *  (c) 2018 3DaGoGo, Inc. (product@astroprint.com)
 *
 *  Distributed under the GNU Affero General Public License http://www.gnu.org/licenses/agpl.html
 */

var AstroPrintApi = function() {}

AstroPrintApi.prototype = {
  EXPIRATION_BUFFER: 10,
  token: null,

  //API functions

  /*
    To create a new api call simply return a the promise from a call to this._apiRequest as defined below. This function
    takes care of token, token refresh and 401 erros automatically.

    _apiRequest(endpoint, ajaxSettings)

    endpoint: This is the API endpoint, starting with / and without including the api version or host
    ajaxSettings: Any setting that can be passed to the jQuery ajax options (https://api.jquery.com/jQuery.ajax/) EXCEPT 'url' which
    is automatically set based on the previous parameter.
  */

  me: function()
  {
    return this._apiRequest('/accounts/me',{method: 'GET'});
  },

  //Private functions

  _getAccessToken: function()
  {
    var promise = $.Deferred();

    if (this.token) {
      token = this.token;
    } else {
      token = localStorage.getItem('access_token');
      if (token) {
        this.token = JSON.parse(token);
      }
    }

    if (token) {
      if (token.expires_at > this._nowInSecs()) {
        return $.Deferred().resolve(token);
      } else {
        //time to refresh
        return this._refreshAccessToken();
      }
    } else {
      return this._getNewAccessToken();
    }
  },

  _getNewAccessToken: function()
  {
    return $.getJSON(API_BASEURL+'astroprint/login-key')
      .then(_.bind(function(data) {
        return $.post({
          url: AP_API_HOST+'/v2/token',
          data: {
            client_id: AP_API_CLIENT_ID,
            grant_type: 'astroprint_login_key',
            scope: 'all',
            login_key: data.login_key
          },
          headers: null
        })
          .then(_.bind(function(token) {
            this._saveToken(token);
            return this.token;
          }, this));
      }, this));
  },

  _refreshAccessToken: function()
  {
    return $.post({
      url: AP_API_HOST+'/v2/token',
      data: {
        client_id: AP_API_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: this.token.refresh_token
      },
      headers: null
    }).then(
      _.bind(function(token){
        this._saveToken(token);
        return this.token;
      }, this),
      _.bind(function(err){
        return this._getNewAccessToken();
      }, this)
    )
  },

  _saveToken: function(token)
  {
    this.token = {
      access_token: token.access_token,
      expires_at: Math.round( this._nowInSecs() + token.expires_in - this.EXPIRATION_BUFFER ),
      refresh_token: token.refresh_token
    };

    localStorage.setItem('access_token', JSON.stringify(this.token));
  },

  _apiRequest: function(endpoint, settings)
  {
    return this._getAccessToken()
      .then(function(token) {
        //This header needs setup by default using $.ajaxSetip needs to be removed for AP requests
        delete $.ajaxSettings.headers['X-Api-Key'];

        return $.ajax(_.extend(settings, {
          url: AP_API_HOST + '/v2' + endpoint,
          headers: {
            Authorization: 'Bearer '+ token.access_token
          },
          cache: true,
          beforeSend: function(xhr, settings) {
            //Se need to set the header back for other AstroBox API requests
            $.ajaxSettings.headers['X-Api-Key'] = UI_API_KEY;
          }
        })).then(
          null,
          _.bind(function(err) {
            if (err.status == 401) {
              // This is bad, so we need to remove all tokens
              this._clearToken();
            }

            return err;
          }, this)
        )
    });
  },

  _clearToken: function()
  {
    this.token = null;
    localStorage.removeItem('access_token');
  },

  _nowInSecs: function()
  {
    return Date.now() / 1000;
  }
};
