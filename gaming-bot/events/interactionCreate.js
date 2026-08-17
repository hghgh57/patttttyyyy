const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { createTicket, claimTicket, closeTicket } = require('../utils/ticketManager');
const {
  hasApplied,
  clearApplied,
  buildDecisionRow,
} = require('../utils/applicationManager');
const { startDmApplication, handleDmApplicationStart, handleDmApplicationCancel } = require('../utils/dmApplication');
const config = require('../config.json');
const { loadGiveaways, saveGiveaways, buildGiveawayEmbed } = require('../utils/giveawayManager');

// ContainerBuilder.setAccentColor needs a number (or null), not a hex
// string like EmbedBuilder.setColor accepts — convert here.
function hexToInt(hex, fallback = 0x5865f2) {
  if (!hex) return fallback;
  const parsed = parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function isSupport(member) {
  const roleIds = config.supportRoleIds || [];
  return roleIds.some((id) => id && !id.startsWith('PUT_') && member.roles.cache.has(id));
}

async function resetTicketDropdown(message) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category_select')
    .setPlaceholder('Select a ticket category…')
    .addOptions(
      config.categories.map((cat) => ({
        label: cat.label,
        description: (cat.description || '').slice(0, 100),
        value: cat.id,
        emoji: cat.emoji || undefined,
      }))
    );

  const titleText = config.panel.title ? `## ${config.panel.title}\n` : '';
  const footerText = config.panel.footer ? `\n-# ${config.panel.footer}` : '';
  const bodyText = `${titleText}${config.panel.description}${footerText}`;

  const container = new ContainerBuilder().setAccentColor(hexToInt(config.panel.color));

  const hasLogo = config.logoUrl && !config.logoUrl.startsWith('PUT_');
  if (hasLogo) {
    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((td) => td.setContent(bodyText))
        .setThumbnailAccessory((thumb) => thumb.setURL(config.logoUrl))
    );
  } else {
    container.addTextDisplayComponents((td) => td.setContent(bodyText));
  }

  container.addActionRowComponents((row) => row.addComponents(menu));

  await message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
}

function buildApplicationPanel() {
  const apps = config.applications || [];
  const menu = new StringSelectMenuBuilder()
    .setCustomId('application_select')
    .setPlaceholder('Select an application…')
    .addOptions(
      apps.map((app) => ({
        label: app.label,
        description: (app.description || '').slice(0, 100),
        value: app.id,
        emoji: app.emoji || undefined,
      }))
    );

  const embed = new EmbedBuilder()
    .setTitle('📋 Applications')
    .setDescription('Select which application you want to fill out below.')
    .setColor('#5865F2');

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
        const categoryId = interaction.values[0];
        try {
          await createTicket(interaction, categoryId);
        } finally {
          await resetTicketDropdown(interaction.message);
        }
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'application_select') {
        const appId = interaction.values[0];
        const appConfig = (config.applications || []).find((a) => a.id === appId);

        // Acknowledge immediately by resetting the dropdown AS the
        // interaction's response, instead of doing a separate message.edit()
        // plus DM-sending work before ever responding — that sequence risks
        // missing Discord's 3-second interaction deadline, which is what
        // was causing "The application did not respond."
        await interaction.update(buildApplicationPanel());

        if (!appConfig) {
          return interaction.followUp({ content: 'That application no longer exists.', ephemeral: true });
        }

        if (hasApplied(interaction.user.id, appId)) {
          return interaction.followUp({
            content: 'You already have a pending application for this. Please wait for a decision before applying again.',
            ephemeral: true,
          });
        }

        const started = await startDmApplication(interaction.guild, interaction.user, appId, appConfig);

        if (!started) {
          return interaction.followUp({
            content: "❌ I couldn't DM you. Please enable direct messages from server members and try again.",
            ephemeral: true,
          });
        }

        return interaction.followUp({ content: '📬 Check your DMs to fill out the application!', ephemeral: true });
      }

      if (interaction.isButton()) {
        if (interaction.customId.startsWith('dmapp_start_')) {
          const appId = interaction.customId.replace('dmapp_start_', '');
          await handleDmApplicationStart(interaction, appId);
          return;
        }

        if (interaction.customId.startsWith('dmapp_cancel_')) {
          const appId = interaction.customId.replace('dmapp_cancel_', '');
          await handleDmApplicationCancel(interaction, appId);
          return;
        }

        if (interaction.customId === 'giveaway_join') {
          const giveaways = loadGiveaways();
          const giveaway = giveaways[interaction.message.id];

          if (!giveaway || giveaway.ended) {
            return interaction.reply({ content: 'This giveaway has ended.', ephemeral: true });
          }

          const userId = interaction.user.id;
          const idx = giveaway.entrants.indexOf(userId);

          if (idx === -1) {
            giveaway.entrants.push(userId);
            saveGiveaways(giveaways);
            await interaction.reply({ content: '🎉 You entered the giveaway!', ephemeral: true });

            const updatedEmbed = buildGiveawayEmbed(
              giveaway.prize,
              giveaway.endTimestamp,
              giveaway.winnerCount,
              giveaway.entrants.length
            );
            await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
            return;
          }

          // Already entered — confirm before removing them, instead of leaving instantly.
          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`giveaway_leave_confirm_${interaction.message.id}`)
              .setLabel('Leave Giveaway')
              .setEmoji('🚪')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId('giveaway_leave_cancel')
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary)
          );

          await interaction.reply({
            content: 'Are you sure you want to leave this giveaway?',
            components: [confirmRow],
            ephemeral: true,
          });
          return;
        }

        if (interaction.customId.startsWith('giveaway_leave_confirm_')) {
          const giveawayMessageId = interaction.customId.replace('giveaway_leave_confirm_', '');
          const giveaways = loadGiveaways();
          const giveaway = giveaways[giveawayMessageId];

          if (!giveaway || giveaway.ended) {
            return interaction.update({ content: 'This giveaway has ended.', components: [] });
          }

          const userId = interaction.user.id;
          const idx = giveaway.entrants.indexOf(userId);
          if (idx !== -1) {
            giveaway.entrants.splice(idx, 1);
            saveGiveaways(giveaways);
          }

          await interaction.update({ content: '🚪 You left the giveaway.', components: [] });

          const updatedEmbed = buildGiveawayEmbed(
            giveaway.prize,
            giveaway.endTimestamp,
            giveaway.winnerCount,
            giveaway.entrants.length
          );
          const giveawayChannel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);
          if (giveawayChannel) {
            const giveawayMessage = await giveawayChannel.messages.fetch(giveawayMessageId).catch(() => null);
            if (giveawayMessage) await giveawayMessage.edit({ embeds: [updatedEmbed] }).catch(() => {});
          }
          return;
        }

        if (interaction.customId === 'giveaway_leave_cancel') {
          await interaction.update({ content: "Okay, you're still entered!", components: [] });
          return;
        }

        if (interaction.customId.startsWith('rr_')) {
          const roleId = interaction.customId.replace('rr_', '');
          const member = interaction.member;

          await interaction.deferReply({ ephemeral: true });

          const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
          if (!role) {
            return interaction.editReply({ content: 'That role no longer exists.' });
          }

          const configEntry = (config.reactionRoles?.roles || []).find((r) => r.roleId === roleId);
          const displayName = configEntry?.label || role.name;

          if (member.roles.cache.has(roleId)) {
            try {
              await member.roles.remove(roleId);
              await interaction.editReply({ content: `Removed the **${displayName}** role.` });
            } catch (err) {
              console.error(`Failed to remove role ${roleId} (${displayName}) from ${member.user.tag}:`, err);
              await interaction.editReply({
                content: `❌ I couldn't remove the **${displayName}** role — I may not have permission (check my role is above it in Server Settings → Roles).`,
              });
            }
          } else {
            try {
              await member.roles.add(roleId);
              await interaction.editReply({ content: `Gave you the **${displayName}** role!` });
            } catch (err) {
              console.error(`Failed to add role ${roleId} (${displayName}) to ${member.user.tag}:`, err);
              await interaction.editReply({
                content: `❌ I couldn't give you the **${displayName}** role — I may not have permission (check my role is above it in Server Settings → Roles).`,
              });
            }
          }
          return;
        }

        if (interaction.customId === 'ticket_claim') {
          await claimTicket(interaction);
          return;
        }

        if (interaction.customId === 'ticket_close') {
          await closeTicket(interaction, null);
          return;
        }

        if (interaction.customId === 'ticket_close_reason') {
          const modal = new ModalBuilder()
            .setCustomId('ticket_close_reason_modal')
            .setTitle('Close Ticket');

          const reasonInput = new TextInputBuilder()
            .setCustomId('close_reason_input')
            .setLabel('Reason for closing')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('e.g. Issue resolved')
            .setRequired(true)
            .setMaxLength(500);

          modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
          await interaction.showModal(modal);
          return;
        }

        if (interaction.customId.startsWith('app_accept_') || interaction.customId.startsWith('app_deny_')) {
          const isAccept = interaction.customId.startsWith('app_accept_');
          const prefix = isAccept ? 'app_accept_' : 'app_deny_';
          const rest = interaction.customId.replace(prefix, '');
          const [applicantId, appId] = rest.split('_');

          if (!isSupport(interaction.member)) {
            return interaction.reply({
              content: 'Only staff can accept or deny applications.',
              ephemeral: true,
            });
          }

          const appConfig = (config.applications || []).find((a) => a.id === appId);
          const label = appConfig ? appConfig.label : 'Application';

          const originalEmbed = interaction.message.embeds[0];
          const updatedEmbed = EmbedBuilder.from(originalEmbed)
            .setColor(isAccept ? '#57F287' : '#ED4245')
            .setFooter({
              text: `${isAccept ? 'Accepted' : 'Denied'} by ${interaction.user.tag}`,
            });

          await interaction.update({
            embeds: [updatedEmbed],
            components: [buildDecisionRow(applicantId, appId, true)],
          });

          clearApplied(applicantId, appId);

          const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);
          if (applicant) {
            await applicant
              .send(
                isAccept
                  ? `🎉 Your **${label}** application in **${interaction.guild.name}** was accepted!`
                  : `Your **${label}** application in **${interaction.guild.name}** was denied.`
              )
              .catch(() => {});
          }
          return;
        }
      }

      if (interaction.isModalSubmit() && interaction.customId === 'ticket_close_reason_modal') {
        const reason = interaction.fields.getTextInputValue('close_reason_input');
        await closeTicket(interaction, reason);
        return;
      }
    } catch (err) {
      console.error('Error handling interaction:', err);
      const errMsg = { content: 'Something went wrong handling that action.', ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errMsg).catch(() => {});
      } else {
        await interaction.reply(errMsg).catch(() => {});
      }
    }
  },
};
