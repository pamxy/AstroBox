var CustomActionView = Backbone.View.extend({
  el: '#custom-action-view',
  customActionContainerView: null,
  events: {
    'hide': 'onHide'
  },
  initialize: function(customActionSequenceID)
  {
    this.customActionContainerView = new CustomActionContainerView(customActionSequenceID);
  },
  onHide: function()
  {
    var customView = this.customActionContainerView.customActionApp_view.customTempView;
    if (customView) {
      customView.stopListening();
    }
  }
});

var CustomActionContainerView = Backbone.View.extend({
  el: '#custom-action-app-container',
  customActionApp: null,
  customActionApp_view: null,
  initialize: function(customActionSequenceID)
  {
    if (app.router.customActionsView) {
      this.customActionApp = app.router.customActionsView.customActionsListView.customizedActionCollection.findWhere({ id: customActionSequenceID });
      this.render();
    } else {
      this.getSequence(customActionSequenceID).then(
        success => {
          this.render();
        },
        error => {
          console.error('error', error);
          this.render();
        }
      );
    }
  },

  getSequence(customActionSequenceID)
  {
    return $.getJSON(API_BASEURL + 'custom-actions', null, _.bind(function(data) {
      if (data.utilities && data.utilities.length) {
        for (var i = 0; i < data.utilities.length; i++) {
          var ca = data.utilities[i];
          if (ca.id == customActionSequenceID && ca.visibility) {
            this.customActionApp = new CustomizedAction(ca);
          }
        }
      }
    }, this))
    .fail(function() {
      noty({text: "There was an error getting customized command.", timeout: 3000});
    })
  },

  render: function()
  {
    var actionEl = this.$el.find('.custom-action-app');
    var noActionEl = this.$el.find('#no-found-action');

    actionEl.empty();
    noActionEl.hide();

    if (this.customActionApp) {
      var row = new CustomActionAppView({ customActionApp: this.customActionApp});
      actionEl.append(row.render().el);
      this.customActionApp_view = row;
    } else {
      noActionEl.show();
      setTimeout(() => {
        window.location.href = window.location.origin+"/#custom"
      }, 2500);
    }
  }
});

var CustomActionAppView = Backbone.View.extend({
  className: 'action-app-row',
  customActionApp: null,
  currentIndexStep: 1,
  currentStep: null,
  customTempView: null,
  events: {
    "click .close": "closeClicked",
    "click .next": "nextClicked",
    "click .action": "actionClicked",
    "click .repeat": "repeatClicked"
  },
  template: _.template($("#custom-action-app-template").html()),
  initialize: function (params)
  {
    this.customActionApp = params.customActionApp;
    this.currentStep = this.customActionApp.get('steps')[this.currentIndexStep-1]

    this.$el.attr('id', this.customActionApp.get('id'));
  },
  closeClicked: function (e)
  {
    e.preventDefault();
    this.doClose();
  },

  doClose()
  {
    var currentLocation = window.location
    currentLocation.href = currentLocation.origin+"/#custom"

    if (this.currentStep.type == "set_temperature") {
      this.customTempView.stopListening();
    }
  },
  nextClicked: function (e)
  {
    e.preventDefault();
    this.doNext();
  },
  doNext()
  {
    var loadingBtn = this.$('button.next').closest('.loading-button');

    switch (this.currentStep.type) {
      case "set_extruder":
        // Change active extruder
        this._sendChangeToolCommand(this.$('#extruder-count').val())
          .done(() => {
            loadingBtn.removeClass('loading');
            this.checkNextStep();
          })
          .fail(() => {
            loadingBtn.addClass('failed');
            noty({ text: "There was an error sending a command.", timeout: 3000 });
            setTimeout(function () {
              loadingBtn.removeClass('failed');
            }, 3000);
          });
        break;
      case "set_temperature":
        this.customTempView.stopListening();
        this.checkNextStep();
        break;
      case "action":
        loadingBtn.addClass('loading');
        if (this.currentStep.commands_on_next) {
          this.sendCommands("next")
            .done(() => {
              console.info('All the commands have been sent');
              loadingBtn.removeClass('loading');
              this.checkNextStep();
            })
            .fail(() => {
              loadingBtn.addClass('failed');
              noty({ text: "There was an error sending a command.", timeout: 3000 });
              setTimeout(function () {
                loadingBtn.removeClass('failed');
              }, 3000);
            });
        } else {
          this.checkNextStep();
        }

        break;
      case "information":
        this.checkNextStep();
        break;
    }
  },

  actionClicked: function (e)
  {
    e.preventDefault();
    this.doAction();
  },

  doAction: function()
  {
    this.sendCommands("action");
  },

  repeatClicked: function (e)
  {
    e.preventDefault();
    this.doRepeat();
  },

  doRepeat: function()
  {
    this.currentIndexStep = 1;
    this.currentStep = this.customActionApp.get('steps')[this.currentIndexStep-1]
    this.render();
  },

  checkNextStep: function()
  {

    // If no Last step
    if (this.currentIndexStep < this.customActionApp.get('steps').length) {
      this.currentIndexStep++;
      this.currentStep = this.customActionApp.get('steps')[this.currentIndexStep-1]
      this.render();
      // If Show temp view
      if (this.currentStep.type == "set_temperature") {
        var loadingBtn = this.$('button.next').closest('.loading-button');
        loadingBtn.addClass('inactive');
        this.customTempView = new CustomTempView();
      }
    // If Last step
    } else {
      this.doClose();
    }
  },

  sendCommands: function(type, commandsIndex, promise)
  {
    if (!commandsIndex) {
      var commandsIndex = 0;
    }
    if (!promise) {
      var promise = $.Deferred();
    }

    var arrayCommands = type == "action" ? this.currentStep.commands_on_action : this.currentStep.commands_on_next;
     $.ajax({

      url: API_BASEURL + 'printer/comm/send',
      method: 'POST',
      data: {
        command: arrayCommands[commandsIndex]
      }
    })
      .success(( () => {
        if (arrayCommands[commandsIndex + 1]) {
          this.sendCommands(type, ++commandsIndex, promise);
        } else {
          promise.resolve();
        }
      }))

      .fail(_.bind(function () {
        promise.reject()
      }, this))

      return promise;
  },

  _sendChangeToolCommand: function(tool)
  {
    var data = {
      command: "select",
      tool: 'tool'+tool
    }

    return $.ajax({
      url: API_BASEURL + "printer/tool",
      type: "POST",
      dataType: "json",
      contentType: "application/json; charset=UTF-8",
      data: JSON.stringify(data)
    });
  },

  render: function ()
  {
    this.$el.empty();
    this.$el.html(this.template({currentStep: this.currentStep, currentIndexStep: this.currentIndexStep, customActionApp: this.customActionApp.toJSON() }));
    return this;
  },
});

var CustomTempView = Backbone.View.extend({
  className: 'control-temps small-12 columns',
  el: '#custom-temp-control-template',
  semiCircleTempView: null,
  currentExtruder: null,
  socketTemps: null,
  initialize: function()
  {
    new SemiCircleProgress();
    var profile = app.printerProfile.toJSON();
    this.currentExtruder = app.socketData.attributes.tool;
    this.renderCircleTemps();

    this.listenTo(app.socketData, 'change:temps', this.updateTemps);
    this.listenTo(app.socketData, 'change:paused', this.onPausedChanged);
    this.listenTo(app.socketData, 'change:tool', this.onToolChanged);
  },
  renderCircleTemps: function() {
    if (app.socketData.attributes.temps != this.socketTemps) {
      this.socketTemps = app.socketData.attributes.temps;
    }
    var temps = null;

    this.$el.find('#slider-nav').empty();
    this.$el.find('#slider').empty();
    this.$el.find('.bed').empty();

    this.semiCircleTempView = new TempSemiCircleView({'tool': this.currentExtruder, enableOff: false, hideBed: true, preHeat: true});

    this.$el.find('#slider').append(this.semiCircleTempView.render().el);

    if (this.socketTemps.lenght > 0) {
      temps = {
        current: this.socketTemps.extruders[this.currentExtruder].current,
        target: this.socketTemps.extruders[this.currentExtruder].target
      };
    } else {
      temps = {current: null, target: null};
    }


    this.semiCircleTempView.setTemps(temps.current, temps.target);

    // Draw circle
    this.$el.find("#"+this.semiCircleTempView.el.id+" .progress-temp-circle").circleProgress({
      arcCoef: 0.55,
      size: 180,
      thickness: 20,
      fill: { gradient: ['#60D2E5', '#E8A13A', '#F02E19'] }
    });

    if (this.socketTemps.length > 0) {
      this.updateTemps(this.socketTemps);
    }
  },
  updateTemps: function(value)
  {
    var temp_values = value.get('temps');
    var temps = { 'current': temp_values.extruders[this.currentExtruder].current, 'target': temp_values.extruders[this.currentExtruder].target };

    (this.semiCircleTempView).updateValues(temps);

    if (this.semiCircleTempView.type == 'tool') {

      var tempValue = '- -';
      if (this.semiCircleTempView.actual != null) {
        tempValue = Math.round(this.semiCircleTempView.actual) + 'º';
      }
      this.$el.find("#tool"+this.currentExtruder).find('.all-temps').text(tempValue);
    }

    this.$("#"+this.semiCircleTempView.el.id+" .progress-temp-circle").circleProgress({
      arcCoef: 0.55,
      size: 180,
      thickness: 20,
      fill: { gradient: ['#60D2E5', '#E8A13A', '#F02E19'] }
    });

    if (temp_values.extruders[this.currentExtruder].current > 180 && temp_values.extruders[this.currentExtruder].current >= temp_values.extruders[this.currentExtruder].target ) {
      var loadingBtn = $('button.next').closest('.loading-button');
      loadingBtn.removeClass('inactive');
    }

  }
});
